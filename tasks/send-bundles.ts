import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types';
import { ethers, Wallet } from 'ethers';
import { task } from 'hardhat/config';

import { SUAVE_CHAIN_ID } from '../src/const';
import { 
	ConfidentialComputeRequest, 
	ConfidentialComputeRecord 
} from '../src/confidential-types'
import * as utils from './utils';


task(
	'send-bundles',
	'Send Mevshare Bundles for the next N blocks',
	async function (_taskArgs: any, hre: HRE, _runSuper: any) {
		utils.checkChain(hre, SUAVE_CHAIN_ID)

		const nBlocks = 2; // todo: use arguments to determine this
		const executionNodeAddr = utils.getEnvValSafe('EXECUTION_NODE');
		const goerliSigner = utils.makeGoerliSigner();
		const suaveSigner = utils.makeSuaveSigner();

		console.log(`Sending bundles for the next ${nBlocks} blocks`)
		console.log(`Goerli signer: ${goerliSigner.address} | Suave signer: ${suaveSigner.address}`)

		await sendMevShareBidTxs(hre, suaveSigner, goerliSigner, executionNodeAddr, nBlocks)
	}
);

async function sendMevShareBidTxs(
	hre: HRE,
	suaveSigner: Wallet,
	goerliSigner: Wallet,
	executionNodeAddr: string,
	nBlocks: number,
) {
	const MevShare = await (hre.ethers as any).getContract('MevShare')
	const Builder = await (hre.ethers as any).getContract('Builder')
	const confidentialDataBytes = await makeDummyBundleBytes(goerliSigner);
	const allowedPeekers = [Builder.address, MevShare.address];
	
	let startingGoerliBlockNum = await goerliSigner.provider.getBlockNumber();
	console.log('startingGoerliBlockNum', startingGoerliBlockNum);
	for (let blockNum = startingGoerliBlockNum + 1; blockNum < startingGoerliBlockNum + nBlocks; blockNum++) {
		const calldata = await MevShare.interface.encodeFunctionData('newBid', [blockNum, allowedPeekers])
		const mevShareCRec = await prepareMevShareBidTx(suaveSigner, calldata, executionNodeAddr, MevShare.address);
		
		const inputBytes = new ConfidentialComputeRequest(mevShareCRec, confidentialDataBytes)
			.signWithWallet(suaveSigner)
			.rlpEncode()

		const response = await (suaveSigner.provider as any).send('eth_sendRawTransaction', [inputBytes])
			.catch(err => {
				console.log('err', err)
			})
		console.log(response)
	}

}

async function makeDummyBundleBytes(signer): Promise<string> {
	const signedTx = await makeDummyTx(signer);
	const bundle = utils.txToBundle(signedTx);
	const bundleBytes = utils.makeConfidentialDataBytesFromBundle(bundle);
	return bundleBytes;
}

async function prepareMevShareBidTx(
	suaveSigner, 
	calldata, 
	executionNodeAddr, 
	mevShareAddr
): Promise<ConfidentialComputeRecord> {
	const nonce = await suaveSigner.getTransactionCount();
	return {
		chainId: SUAVE_CHAIN_ID,
		nonce,
		to: mevShareAddr,
		value: ethers.utils.parseEther('0'),
		gas: ethers.BigNumber.from(10000000),
		gasPrice: ethers.utils.parseUnits('20', 'gwei'),
		data: calldata, 
		executionNode: executionNodeAddr,
	};
}

async function makeDummyTx(signer) {
	const nonce = await signer.getTransactionCount();
	const tx = {
		nonce,
		from: signer.address,
		to: signer.address,
		value: '0x5af3107a4000',
		gasPrice: '0x04a817c800',
		gasLimit: '0x59d8',
		chainId: 5,
	};
	const signed = await utils.signTransactionNonRlp(signer, tx);
	const parsed = utils.parseTx(signed);
	return parsed;
}

