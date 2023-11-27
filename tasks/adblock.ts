import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types';
import { ethers, Wallet, BigNumber } from 'ethers';
import { task, types } from 'hardhat/config';

import { ConfidentialComputeRequest } from '../src/confidential-types'
import { SUAVE_CHAIN_ID } from '../src/const';
import * as utils from './utils';
import {
	getEnvConfig as getBuildEnvConfig,
	ITaskConfig as IBuildConfig,
	doBlockBuilding
} from './build-blocks';


const adbidInterface = utils.getInterface('BlockAdAuctionV2')

// todo: add required params
task('block-ad', 'Submit bids, build blocks and send them to relay')
	.addOptionalParam('nslots', 'Number of slots to build blocks for. Default is two.', 1, types.int)
	.addOptionalParam('builder', 'Address of a Builder contract. By default fetch most recently deployed one.')
	.addOptionalParam('mevshare', 'Address of a MevShare contract. By default fetch most recently deployed one.')
	.addOptionalParam('extra', 'Msg to be put in the block\'s extra param', '😎', types.string)
	.addOptionalParam('adbid', 'Bid amount for including the ad', 0.2, types.float)
	.addOptionalParam('blockrange', 'For how many blocks the ad-request is valid', 2, types.int)
	.addFlag('build', 'Whether to build blocks or not')
	.setAction(async function (taskArgs: any, hre: HRE) {
		utils.checkChain(hre, SUAVE_CHAIN_ID)
		const config = await getConfig(hre, taskArgs);

		console.log(`Suave signer: ${config.suaveSigner.address}`)
		console.log(`Goerli signer: ${config.goerliSigner.address}`)
		
		await cInitIfNeeded(config)
		if (taskArgs.build) {
			console.log(`Sending blocks for the next ${config.nSlots} slots`)
			await submitAndBuild(config)
		} else {
			await sendAdBid(config)
		}
	})

async function sendAdBid(c: ITaskConfig) {	
	console.log('Submitting adbid');
	await submitAdBid(c)
}

async function submitAndBuild(c: ITaskConfig) {
	const success = await submitAdBid(c)
	if (!success)
		process.exit(0)
	
	const buildConfig: IBuildConfig = {
		...getBuildEnvConfig(),
		executionNodeAdd: c.executionNodeAdd, 
		builderAdd: c.adauctionAdd,
		nSlots: c.nSlots,
	}
	await doBlockBuilding(
		buildConfig,
		{ iface: adbidInterface, method: 'buildBlock' }
	)
}

async function submitAdBid(c: ITaskConfig): Promise<boolean> {
	process.stdout.write('📢 Submitting ad ... ')
	const blockNum = await c.goerliSigner.provider.getBlockNumber()
	const bidAmount = ethers.utils.parseEther(c.adBid.toString())
	const [s, e] = await sendAdForBlock(
		c.suaveSigner,
		c.goerliSigner,
		c.executionNodeAdd, 
		c.adauctionAdd,
		blockNum + c.blockrange,
		c.extra,
		bidAmount
	)
	if (s) {
		console.log('✅')
		await s.then(console.log)
		return true
	} else {
		console.log('❌')
		console.log(e)
		return false
	}
}

async function sendAdForBlock(
	suaveSigner: Wallet,
	goerliSigner: Wallet,
	executionNodeAdd: string,
	adbuilderAdd: string, 
	blockLimit: number, 
	extra: string,
	bidAmount: BigNumber
): Promise<utils.Result<Promise<string>>> {
	const calldata = adbidInterface.encodeFunctionData('buyAd', [blockLimit, extra])
	const confidentialRec = await utils.createConfidentialComputeRecord(
		suaveSigner,
		calldata, 
		executionNodeAdd, 
		adbuilderAdd,
	);
	const confidentialBytes = await utils.makePaymentBundleBytes(goerliSigner, bidAmount)
	const inputBytes = new ConfidentialComputeRequest(confidentialRec, confidentialBytes)
		.signWithWallet(suaveSigner)
		.rlpEncode()
	const result = await utils.submitRawTxPrettyRes(suaveSigner.provider, inputBytes, adbidInterface, 'SubmitAd')

	return result
}

async function cInitIfNeeded(c: ITaskConfig): Promise<void> {
	const input = adbidInterface.encodeFunctionData('isInitialized', [])
	const isInit = await c.suaveSigner.provider.call({to: c.adauctionAdd, data: input})
		.then(res => adbidInterface.decodeFunctionResult('isInitialized', res))
	if (!isInit) {
		const success = await confidentialInit(c)
		if (!success)
			process.exit(0)
	}
}

async function confidentialInit(c: ITaskConfig): Promise<boolean> {
	const calldata = adbidInterface.encodeFunctionData('confidentialConstructor', [])
	const confidentialRec = await utils.createConfidentialComputeRecord(
		c.suaveSigner,
		calldata, 
		c.executionNodeAdd, 
		c.adauctionAdd,
	);
	const confidentialBytes = ethers.utils.id(utils.getRandomStr())
	const inputBytes = new ConfidentialComputeRequest(confidentialRec, confidentialBytes)
		.signWithWallet(c.suaveSigner)
		.rlpEncode()
	console.log('Sending init tx')
	const [s, e] = await utils.submitRawTxPrettyRes(c.suaveSigner.provider, inputBytes, adbidInterface, 'ConfidentialInit')
	if (s) {
		console.log('✅')
		await s.then(console.log)
		return true
	} else {
		console.log('❌')
		console.log(e)
		return false
	}
}

interface ITaskConfig {
	nSlots: number,
	executionNodeAdd: string,
	suaveSigner: Wallet,
	goerliSigner: Wallet,
	extra: string,
	adBid: number,
	adauctionAdd: string,
	blockrange: number,
}

async function getConfig(hre: HRE, taskArgs: any): Promise<ITaskConfig> {
	const cliConfig = await parseTaskArgs(hre, taskArgs)
	const envConfig = getEnvConfig()
	return {
		...cliConfig, 
		...envConfig,
	}
}

export function getEnvConfig() {
	const executionNodeAdd = utils.getEnvValSafe('EXECUTION_NODE');
	const suaveSigner = utils.makeSuaveSigner();
	const goerliSigner = utils.makeGoerliSigner();
	return {
		executionNodeAdd,
		goerliSigner,
		suaveSigner,
	}
}

async function parseTaskArgs(hre: HRE, taskArgs: any) {
	const nSlots = parseFloat(taskArgs.nslots);
	const blockrange = taskArgs.blockrange
	const extra = taskArgs.extra
	const adBid = taskArgs.adbid
	const adauctionAdd = taskArgs.mevshare
		? taskArgs.mevshare
		: await utils.fetchDeployedContract(hre, 'BlockAdAuctionV2').then(c => c.address)

	return { nSlots, adauctionAdd, extra, adBid, blockrange }
}



