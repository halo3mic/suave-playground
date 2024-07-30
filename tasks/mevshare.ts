import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types'
import { task, types } from 'hardhat/config'
import { ethers, Wallet } from 'ethers'

import { supportedSuaveChains, precompiles } from './utils/const'
import { SuaveContract } from 'ethers-suave'
import {
	getEnvConfig as getBuildEnvConfig,
	ITaskConfig as IBuildConfig,
	doBlockBuilding
} from './build-blocks'
import * as utils from './utils'


task('mevshare-bundles', 'Send Mevshare Bundles for the next N blocks')
	.addOptionalParam('nslots', 'Number of blocks to send bundles for. Default is two.', 1, types.int)
	.addOptionalParam('mevshare', 'Address of a MevShare contract. By default fetch most recently deployed one.')
	.addOptionalParam('builder', 'Address of a Builder contract. By default fetch most recently deployed one.')
	.addFlag('build', 'Whether to build blocks or not')
	.setAction(async function (taskArgs: any, hre: HRE) {
		utils.checkChain(hre, supportedSuaveChains)

		const config = await getConfig(hre, taskArgs)
		console.log(`Sending bundles for the next ${config.nslots} blocks`)
		console.log(`Holesky signer: ${config.holeskySigner.address}`)
		console.log(`Suave signer: ${config.suaveSignerAddress}`)

		if (taskArgs.build) {
			console.log(`Sending blocks for the next ${config.nslots} slots`)
			await submitAndBuild(config)
		} else {
			await sendMevShareBundles(config)
		}
	})
	

async function sendMevShareBundles(c: ITaskConfig) {	
	const startHoleskyBlock = await c.holeskySigner.provider.getBlockNumber()
	console.log('startingHoleskyBlockNum', startHoleskyBlock)
	for (let i=2; i < c.nslots + 1; i++) {
		await submitMevShareBid(c, startHoleskyBlock)
	}
}

async function submitAndBuild(c: ITaskConfig) {
	const precall = () => submitMevShareBid(c)
	const buildConfig: IBuildConfig = {
		...await getBuildEnvConfig(c.chainId),
		suaveSignerAddress: c.suaveSignerAddress,
		builder: c.builder,
		nSlots: c.nslots,
	}
	await doBlockBuilding(buildConfig, { precall })
}

export async function submitMevShareBid(c: ITaskConfig, blockNum?: number): Promise<boolean> {
	if (!blockNum) {
		blockNum = await c.holeskySigner.provider.getBlockNumber() + 1
	}
	process.stdout.write('🦋 Submitting MevShare bundle ...')
	const txReward = ethers.utils.parseEther('0.1') // todo: make this a param
	const confidentialDataBytes = await utils.makePaymentBundleBytes(c.holeskySigner, txReward)
	const allowedPeekers = await Promise.all([
		c.mevshare.getAddress(), 
		c.builder.getAddress(), 
		precompiles.buildEthBlock
	])
	const res = await sendBidForBlock(
		c.mevshare,
		blockNum,
		allowedPeekers,
		confidentialDataBytes, 
	)
	return utils.handleResult(res)
}

export async function sendBidForBlock(
	mevshare: SuaveContract,
	blockNum: number,
	allowedPeekers: string[],
	confidentialInputs: string,
): Promise<utils.Result<Promise<string>>> {
	const promise = mevshare.newBid.sendConfidentialRequest(
		blockNum, 
		allowedPeekers, 
		allowedPeekers, 
		{ confidentialInputs }
	)
	return utils.prettyPromise(promise, mevshare, 'MevShare')
}

interface ITaskConfig {
	nslots: number,
	suaveSignerAddress: string,
	mevshare: SuaveContract,
	builder: SuaveContract,
	holeskySigner: Wallet,
	chainId: number,
}

async function getConfig(hre: HRE, taskArgs: any): Promise<ITaskConfig> {
	const chainId = utils.getNetworkChainId(hre)
	const { nslots, mevshareContract, builderContract } = await parseTaskArgs(hre, taskArgs)
	const { holeskySigner, suaveSigner } = await parseEnvConfig(hre, chainId)
	const suaveSignerAddress = await suaveSigner.getAddress()
	const mevshare = new SuaveContract(
		mevshareContract.address,
		mevshareContract.interface,
		suaveSigner,
	)
	const builder = new SuaveContract(
		builderContract.address,
		builderContract.interface,
		suaveSigner,
	)
	return {
		suaveSignerAddress,
		holeskySigner,
		mevshare,
		nslots,
		builder,
		chainId,
	}
}

async function parseTaskArgs(hre: HRE, taskArgs: any) {
	const nslots = parseInt(taskArgs.nslots)
	const mevshareContract = taskArgs.mevshare
		? await hre.ethers.getContractAt('MevShare', taskArgs.mevshare)
		: await utils.fetchDeployedContract(hre, 'MevShare')
	const builderContract = taskArgs.mevshare
		? await hre.ethers.getContractAt('Builder', taskArgs.builder)
		: await utils.fetchDeployedContract(hre, 'Builder')

	return { nslots, mevshareContract, builderContract }
}

async function parseEnvConfig(hre: HRE, chainId: number) {
	const holeskySigner = utils.makeHoleskySigner()
	const suaveSigner = utils.makeSuaveSigner(chainId)
	return { holeskySigner, chainId, suaveSigner }
}