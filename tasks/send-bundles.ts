import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types';
import { task, types } from 'hardhat/config';
import { ethers, Wallet } from 'ethers';

import { SUAVE_CHAIN_ID } from '../src/const';
import { 
	ConfidentialComputeRequest, 
	ConfidentialComputeRecord 
} from '../src/confidential-types'
import * as utils from './utils';


const precompiles = { // todo: move
	buildEthBlock: '0x0000000000000000000000000000000042100001'
}

const abis = utils.fetchAbis()

task('send-bundles', 'Send Mevshare Bundles for the next N blocks')
	.addOptionalParam("nblocks", "Number of blocks to send bundles for. Default is two.", 1, types.int)
	.addOptionalParam("mevshare", "Address of a MevShare contract. By default fetch most recently deployed one.")
	.addOptionalParam("builder", "Address of a Builder contract. By default fetch most recently deployed one.")
	.setAction(async function (taskArgs: any, hre: HRE) {
		utils.checkChain(hre, SUAVE_CHAIN_ID)

		const config = await getConfig(hre, taskArgs);
		console.log(`Sending bundles for the next ${config.nBlocks} blocks`)
		console.log(`Goerli signer: ${config.goerliSigner.address}`)
		console.log(`Suave signer: ${config.suaveSigner.address}`)

		await sendMevShareBidTxs(config)
	})
	

async function sendMevShareBidTxs(c: ITaskConfig) {
	const mevshareInterface = new ethers.utils.Interface(abis['MevShareBidContract'])
	const confidentialDataBytes = await makeDummyBundleBytes(c.goerliSigner);
	const allowedPeekers = [c.mevshareAdd, c.builderAdd, precompiles.buildEthBlock];
	const allowedStores = [];
	
	let startGoerliBlock = await c.goerliSigner.provider.getBlockNumber();
	console.log('startingGoerliBlockNum', startGoerliBlock);
	for (let blockNum = startGoerliBlock + 1; blockNum < startGoerliBlock + c.nBlocks + 1; blockNum++) {
		const calldata = mevshareInterface
			.encodeFunctionData('newBid', [blockNum, allowedPeekers, allowedStores])
		const mevShareConfidentialRec = await prepareMevShareBidTx(
			c.suaveSigner, 
			calldata, 
			c.executionNodeAdd, 
			c.mevshareAdd
		);
		
		const inputBytes = new ConfidentialComputeRequest(mevShareConfidentialRec, confidentialDataBytes)
			.signWithWallet(c.suaveSigner)
			.rlpEncode()

		const response = await (c.suaveSigner.provider as any).send('eth_sendRawTransaction', [inputBytes])
			.catch(err => {
				console.log('err submitting tx', err)
			})
		console.log(`tx: ${response}`)
		await handleNewSubmission(c.suaveSigner.provider, mevshareInterface, response)
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
	const signed = await signer.signTransaction(tx);
	return signed;
}

async function handleNewSubmission(provider, mevshareInterface, txHash) {
	const receipt = await provider.waitForTransaction(txHash)
	if (receipt.status === 0) {
		console.log(`⛔️ tx failed`)
		console.log(`${JSON.stringify(receipt)}`)
	} else {
		const tab = n => '  '.repeat(n)
		console.log(`\n✅ tx succeeded`)
		receipt.logs.forEach(log => {
			const parsedLog = mevshareInterface.parseLog(log);
			console.log(`${tab(1)}${parsedLog.name}`)
			parsedLog.eventFragment.inputs.forEach((input, i) => {
				if (parsedLog.name == "HintEvent" && input.name == "hint") {
					const hintTo = parsedLog.args[i].slice(0, 43)
					const hintData = '0x' + parsedLog.args[i].slice(43)
					console.log(`${tab(2)}${input.name}:\n${tab(3)}to: ${hintTo}\n${tab(3)}data: ${hintData}`)
				} else {
					console.log(`${tab(2)}${input.name}: ${parsedLog.args[i]}`)
				}
			})
		})
	}
} 

interface ITaskConfig {
	nBlocks: number,
	mevshareAdd: string,
	builderAdd: string,
	executionNodeAdd: string,
	goerliSigner: Wallet,
	suaveSigner: Wallet,
}

async function getConfig(hre: HRE, taskArgs: any): Promise<ITaskConfig> {
	const { nBlocks, mevshareAdd, builderAdd } = await parseTaskArgs(hre, taskArgs)
	const executionNodeAdd = utils.getEnvValSafe('EXECUTION_NODE');
	const goerliSigner = utils.makeGoerliSigner();
	const suaveSigner = utils.makeSuaveSigner();
	return {
		nBlocks,
		mevshareAdd,
		builderAdd,
		executionNodeAdd,
		goerliSigner,
		suaveSigner,
	}
}

async function parseTaskArgs(hre: HRE, taskArgs: any) {
	const nBlocks = parseInt(taskArgs.nblocks);
	const mevshareAdd = taskArgs.mevshare
		? taskArgs.mevshare
		: await utils.fetchDeployedContract(hre, 'MevShare').then(c => c.address)
	const builderAdd = taskArgs.mevshare
		? taskArgs.mevshare
		: await utils.fetchDeployedContract(hre, 'Builder').then(c => c.address)

	return { nBlocks, mevshareAdd, builderAdd }
}