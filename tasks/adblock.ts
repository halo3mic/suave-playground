import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types'
import { task, types } from 'hardhat/config'
import { ethers, Wallet } from 'ethers'

import { supportedSuaveChains } from './utils/const'
import { SuaveContract } from 'ethers-suave'
import * as utils from './utils'
import {
	getEnvConfig as getBuildEnvConfig,
	ITaskConfig as IBuildConfig,
	doBlockBuilding
} from './build-blocks'


task('block-ad', 'Submit bids, build blocks and send them to relay')
	.addOptionalParam('extra', 'Msg to put in the block\'s extra param', '🛸', types.string)
	.addOptionalParam('adbid', 'Bid amount in ETH for including the ad', 0.2, types.float)
	.addOptionalParam('nslots', 'For how many blocks the ad-request is valid', 2, types.int)
	.addOptionalParam('builder', 'Address of a Builder contract. By default fetch most recently deployed one.')
	.addOptionalParam('mevshare', 'Address of a MevShare contract. By default fetch most recently deployed one.')
	.addFlag('build', 'Whether to build blocks after sending the ad-request')
	.setAction(async function (taskArgs: any, hre: HRE) {
		utils.checkChain(hre, supportedSuaveChains)
		const config = await getConfig(hre, taskArgs)

		console.log(`Suave signer: ${config.suaveSignerAddress}`)
		console.log(`Holesky signer: ${config.holeskySigner.address}`)
		
		await cInitIfNeeded(config)
		await sendAdBid(config)
		if (taskArgs.build) {
			console.log(`Sending blocks for the next ${config.nslots} slots`)
			await build(config)
		} else {
		}
	})

async function sendAdBid(c: ITaskConfig) {	
	console.log('Submitting adbid')
	// todo: show the err
	const success = await submitAdBid(c)
	if (!success)
		process.exit(0)
}

async function build(c: ITaskConfig) {
	const buildConfig: IBuildConfig = {
		...await getBuildEnvConfig(c.chainId),
		suaveSignerAddress: c.suaveSignerAddress,
		builder: c.blockad,
		nSlots: c.nslots,
		resubmit: false
	}
	const bopt = { 
		method: 'buildBlock',
		precall: async () => utils.sleep(4000).then(() => true)
	}
	await doBlockBuilding(buildConfig, bopt)
}

async function submitAdBid(c: ITaskConfig): Promise<boolean> {
	checkExtraIsValid(c.extra)
	process.stdout.write('📢 Submitting ad ... ')
	const blockNum = await c.holeskySigner.provider.getBlockNumber()
	return sendAdForBlock(c, blockNum)
		.then(utils.handleResult)
}

async function sendAdForBlock(
	c: ITaskConfig,
	currentBlockNum: number,
): Promise<utils.Result<Promise<string>>> {
	const blockLimit = currentBlockNum + c.nslots
	const bidAmount = ethers.utils.parseEther(c.adBid.toString())

	const confidentialInputs = await utils.makePaymentBundleBytes(c.holeskySigner, bidAmount)
	const promise = c.blockad.buyAd.sendConfidentialRequest(blockLimit, c.extra, {confidentialInputs})
	return utils.prettyPromise(promise, c.blockad, 'Building block')
}

async function cInitIfNeeded(c: ITaskConfig): Promise<void> {
	const isInit = await c.blockad.isInitialized()
	if (!isInit) {
		const success = await confidentialInit(c)
		if (!success)
			process.exit(0)
	} else {
		console.log('Already initialized')
	}
}

async function confidentialInit(c: ITaskConfig): Promise<boolean> {
	const confidentialInputs = ethers.utils.id(utils.getRandomStr())
	let ccrPromise = c.blockad.confidentialConstructor.sendConfidentialRequest({ confidentialInputs })
	console.log('Sending init tx')
	return utils.prettyPromise(ccrPromise, c.blockad, 'Building block')
		.then(utils.handleResult)
}

function checkExtraIsValid(extra: string) {
	if (ethers.utils.toUtf8Bytes(extra).byteLength > 32)
		throw new Error('Extra param too long - max 32 bytes')
}

interface ITaskConfig {
	suaveSignerAddress: string,
	holeskySigner: Wallet,
	extra: string,
	adBid: number,
	blockad: SuaveContract,
	nslots: number,
	chainId: number
}

async function getConfig(hre: HRE, taskArgs: any): Promise<ITaskConfig> {
	const chainId = utils.getNetworkChainId(hre)
	const { blockadContract, ...cliConfig } = await parseTaskArgs(hre, taskArgs)
	const { suaveSigner, ...envConfig } = await getEnvConfig(chainId)
	const suaveSignerAddress = await suaveSigner.getAddress()
	const blockad = new SuaveContract(
		blockadContract.address,
		blockadContract.interface,
		suaveSigner
	)
	return {
		...cliConfig, 
		...envConfig,
		suaveSignerAddress,
		blockad,
		chainId,
	}
}

export async function getEnvConfig(hhChainId: number) {
	const holeskySigner = utils.makeHoleskySigner()
	const suaveSigner = utils.makeSuaveSigner(hhChainId);
	const executionNodeAdd = await (suaveSigner.provider as any)
		.send('eth_kettleAddress', [])
		.then((res: string[]) => res[0])
	return {
		executionNodeAdd,
		holeskySigner,
		suaveSigner,
	}
}

async function parseTaskArgs(hre: HRE, taskArgs: any) {
	const nslots = taskArgs.nslots
	const extra = taskArgs.extra
	const adBid = taskArgs.adbid
	const blockadContract = taskArgs.blockad
		? await hre.ethers.getContractAt('BlockAdAuctionV2', taskArgs.mevshare)
		: await utils.fetchDeployedContract(hre, 'BlockAdAuctionV2')

	return { blockadContract, extra, adBid, nslots }
}