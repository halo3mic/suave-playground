import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types'
import { task, types } from 'hardhat/config'
import { ethers, Wallet } from 'ethers'

import { ConfidentialComputeRequest } from '../src/confidential-types'
import {
	getEnvConfig as getBuildEnvConfig,
	ITaskConfig as IBuildConfig,
	doBlockBuilding
} from './build-blocks'
import { SUAVE_CHAIN_ID, RIGIL_CHAIN_ID, PRECOMPILES } from './utils/const'
import { Result } from './utils'
import * as utils from './utils'


const mevshareInterface = utils.getInterface('MevShareBidContract')

task('mevshare-bundles', 'Send Mevshare Bundles for the next N blocks')
	.addOptionalParam('nslots', 'Number of blocks to send bundles for. Default is two.', 1, types.int)
	.addOptionalParam('mevshare', 'Address of a MevShare contract. By default fetch most recently deployed one.')
	.addOptionalParam('builder', 'Address of a Builder contract. By default fetch most recently deployed one.')
	.addFlag('build', 'Whether to build blocks or not')
	.setAction(async function (taskArgs: any, hre: HRE) {
		utils.checkChain(hre, [SUAVE_CHAIN_ID, RIGIL_CHAIN_ID])

		const config = await getConfig(hre, taskArgs)
		console.log(`Sending bundles for the next ${config.nslots} blocks`)
		console.log(`Holesky signer: ${config.holeskySigner.address}`)
		console.log(`Suave signer: ${config.suaveSigner.address}`)

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
		executionNodeAdd: c.executionNodeAdd, 
		suaveSigner: c.suaveSigner,
		builderAdd: c.builderAdd,
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
	const allowedPeekers = [c.mevshareAdd, c.builderAdd, PRECOMPILES.buildEthBlock]
	const [s, e] = await sendBidForBlock(
		c.suaveSigner, 
		c.executionNodeAdd,
		c.mevshareAdd,
		blockNum,
		confidentialDataBytes, 
		allowedPeekers,
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

export async function sendBidForBlock(
	suaveSigner: Wallet, 
	executionNodeAdd: string,
	mevshareAdd: string,
	blockNum: number,
	confidentialBytes: string, 
	allowedPeekers: string[],
): Promise<Result<Promise<string>>> {
	const calldata = mevshareInterface.encodeFunctionData('newBid', [blockNum, allowedPeekers, allowedPeekers])
	const mevShareConfidentialRec = await utils.createConfidentialComputeRecord(
		suaveSigner, 
		calldata, 
		executionNodeAdd, 
		mevshareAdd, 
	)
	const inputBytes = new ConfidentialComputeRequest(mevShareConfidentialRec, confidentialBytes)
		.signWithWallet(suaveSigner)
		.rlpEncode()
	const res = utils.submitRawTxPrettyRes(suaveSigner.provider, inputBytes, mevshareInterface, 'MevShareBundle')

	return res
}

interface ITaskConfig {
	nslots: number,
	mevshareAdd: string,
	builderAdd: string,
	executionNodeAdd: string,
	holeskySigner: Wallet,
	suaveSigner: Wallet,
	chainId: number,
}

async function getConfig(hre: HRE, taskArgs: any): Promise<ITaskConfig> {
	const { nslots, mevshareAdd, builderAdd } = await parseTaskArgs(hre, taskArgs)
	const holeskySigner = utils.makeHoleskySigner()
	const chainId = utils.getNetworkChainId(hre)
	const suaveSigner = utils.makeSuaveSigner(chainId)
	const executionNodeAdd = await (suaveSigner.provider as any)
		.send('eth_kettleAddress', [])
		.then((res: string[]) => res[0])
	return {
		nslots,
		mevshareAdd,
		builderAdd,
		executionNodeAdd,
		holeskySigner,
		suaveSigner,
		chainId,
	}
}

async function parseTaskArgs(hre: HRE, taskArgs: any) {
	const nslots = parseInt(taskArgs.nslots)
	const mevshareAdd = taskArgs.mevshare
		? taskArgs.mevshare
		: await utils.fetchDeployedContract(hre, 'MevShare').then(c => c.address)
	const builderAdd = taskArgs.mevshare
		? taskArgs.builder
		: await utils.fetchDeployedContract(hre, 'Builder').then(c => c.address)

	return { nslots, mevshareAdd, builderAdd }
}