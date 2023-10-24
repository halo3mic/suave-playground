const { task } = require("hardhat/config");
const { getEnvValSafe, fetchAbis } = require('../utils')
const { ethers } = require("ethers");

const abis = fetchAbis();
const SUAVE_CHAIN_ID = 424242;
const CONFIDENTIAL_COMPUTE_RECORD_TYPE_INT = 66 // 0x42
const CONFIDENTIAL_COMPUTE_REQUEST_TYPE_INT = 67 // 0x43

task(
  'send-bundles',
  'Send Mevshare Bundles for the next 26 blocks',
  async function (_, hre, _) {
      	checkChain(hre, SUAVE_CHAIN_ID)

		const nBlocks = 2;
		const executionNodeAddr = getEnvValSafe("EXECUTION_NODE");
	  	const goerliSigner = makeGoerliSigner();
	  	const suaveSigner = makeSuaveSigner();

		const res = ethers.utils.defaultAbiCoder.decode(
			['string'],
			'0x000000000000000000000000000000000000000000000000000000004210000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000'
		)
		console.log(res)


		// await sendMevShareBidTxs(suaveSigner, goerliSigner, executionNodeAddr, nBlocks)

  }
);

function makeGoerliSigner() {
	return makeSigner(getEnvValSafe("GOERLI_RPC"), getEnvValSafe("GOERLI_PK"));
}

function makeSuaveSigner() {
	return makeSigner(getEnvValSafe("SUAVE_RPC"), getEnvValSafe("SUAVE_PK"));
}

function makeSigner(rpcUrl, pk) {
	const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
	const signer = new ethers.Wallet(pk, provider);
	return signer
}

async function sendMevShareBidTxs(
	suaveSigner,
	goerliSigner,
	executionNodeAddr,
	nBlocks,
) {
	const MevShare = await hre.ethers.getContract('MevShare')
	const Builder = await hre.ethers.getContract('Builder')
	
	const bundleBytes = await makeDummyBundleBytes(goerliSigner);
	const confidentialDataBytes = ethers.utils.defaultAbiCoder.encode(['bytes'], [bundleBytes])
	const confidentialInputsHash = ethers.utils.keccak256(confidentialDataBytes)
	const allowedPeekers = [Builder.address, MevShare.address];
	
	console.log('🤐 confidentialDataBytes:\n', confidentialDataBytes)
	console.log('👀 peekers:\n', allowedPeekers)
	
	let startingGoerliBlockNum = await getGoerliBlock(goerliSigner.provider);
	console.log("startingGoerliBlockNum", startingGoerliBlockNum);
	for (let blockNum = startingGoerliBlockNum + 1; blockNum < startingGoerliBlockNum + nBlocks; blockNum++) {
		const calldata = await MevShare.interface.encodeFunctionData('newBid', [blockNum, allowedPeekers])
		const mevShareTxRlp = await prepareMevShareBidTx(suaveSigner, calldata, executionNodeAddr, MevShare.address, confidentialInputsHash);
		
		console.log("sendMevShareBidTx", "mevShareTx", mevShareTxRlp);

		const inputBytes = makeConfidentialComputeRequest(mevShareTxRlp, confidentialDataBytes);
		console.log(inputBytes)
		const response = await suaveSigner.provider.send('eth_sendRawTransaction', [inputBytes])
		console.log(response)
	}

}

async function makeDummyBundleBytes(signer) {
	const signedTx = await makeDummyTx(signer);
	const bundle = txToBundle(signedTx);
	const bundleBytes = Buffer.from(JSON.stringify(bundle), 'utf8')
	return bundleBytes;
}

async function makeDummyTx(signer) {
	const tx = {
		from: signer.address,
		to: signer.address,
		value: ethers.utils.parseEther("0.0001"),
		gasPrice: ethers.utils.parseUnits("20", "gwei"),
		gasLimit: ethers.BigNumber.from(23000),
		chainId: SUAVE_CHAIN_ID,
	};
	const signed = await signTransactionNonRlp(signer, tx);
	return signed;
}

async function signTransactionNonRlp(signer, tx) {
	const rlpSigned = await signer.signTransaction(tx);
	return ethers.utils.parseTransaction(rlpSigned);
}

function txToBundle(signedTx) {
	return {
	  txs: [signedTx],
	  revertingHashes: [],
	  refundPercent: 0,
	};
}

async function prepareMevShareBidTx(suaveSigner, calldata, executionNodeAddr, mevShareAddr, confidentialInputsHash) {
	const nonce = await suaveSigner.getTransactionCount();
	const tx = {
		nonce,
		to: mevShareAddr,
		value: ethers.utils.parseEther('0'),
		gasLimit: ethers.BigNumber.from(10000000),
		gasPrice: ethers.utils.parseUnits('20', 'gwei'),
		data: calldata
	};	
	const confidentialRlp = await makeConfidentialComputeRecord(
		suaveSigner,
		executionNodeAddr,
		confidentialInputsHash,
		tx,
	);

	return confidentialRlp;
}

function makeConfidentialComputeRequest(
	confidentialComputeRecord,
	confidentialDataBytes
) {
	console.log(confidentialComputeRecord)
	console.log(confidentialDataBytes)
	const rlpEncoded = ethers.utils.RLP.encode([
		confidentialComputeRecord,
		confidentialDataBytes,
	]);
	const eip2718Id = intToHex(CONFIDENTIAL_COMPUTE_REQUEST_TYPE_INT);

	return eip2718Id + rlpEncoded.slice(2);
}

async function makeConfidentialComputeRecord(
		signer, 
		executionNode,
		confidentialInputsHash,
		confidentialTx,
	) {
	console.log(executionNode)
	console.log(confidentialInputsHash)
	console.log(confidentialTx)
	const rlpEncoded = ethers.utils.RLP.encode([
		intToHex(confidentialTx.nonce), 
		confidentialTx.gasPrice.toHexString(), 
		confidentialTx.gasLimit.toHexString(), 
		confidentialTx.to, 
		confidentialTx.value.toHexString(), 
		confidentialTx.data, 
		executionNode,
		confidentialInputsHash,
		intToHex(SUAVE_CHAIN_ID),
		// todo: real v, r, s
		'0x00',
		'0x00',
		'0x00',
	]);
	const eip2718Id = intToHex(CONFIDENTIAL_COMPUTE_RECORD_TYPE_INT);

	return eip2718Id + rlpEncoded.slice(2);
}

async function getGoerliBlock(goerliProvider) {
	try {
		startingGoerliBlockNum = await goerliProvider.getBlockNumber();
		return startingGoerliBlockNum;
	} catch (err) {
		throw new Error(`could not get goerli block: ${err}`);
	}
}

function checkChain(hre, desiredChain) {
  const chainId = hre.network.config.chainId
      if (chainId != desiredChain) {
          throw Error(`Skipping deployment, expected Suave chain-id(424242), got ${chainId}`)
      }
}

function intToHex(intVal) {
	let hex = intVal.toString(16);
	if (hex.length % 2) {
		hex = '0' + hex;
	}
	return '0x' + hex;
}