import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types'
import { task, types } from 'hardhat/config'
import { Wallet } from 'ethers'

import { SuaveJsonRpcProvider, SuaveWallet, SuaveContract } from 'ethers-suave'
import { supportedSuaveChains } from './utils/const'
import * as utils from './utils'

task('oracle-updates', 'Send Binance oracle updates for the next N blocks')
	.addParam('ticker', 'Binance ticker of the asset to update')
	.addOptionalParam('nblocks', 'Number of blocks to send bundles for. Default is two.', 1, types.int)
	.addOptionalParam('oracle', 'Address of the oracle contract. By default fetch most recently deployed one.')
	.addFlag('privateSubmission', 'Whether to submit the oracle updates via bundles. By default use public RPC.')
	.setAction(async function (taskArgs: any, hre: HRE) {
		utils.checkChain(hre, supportedSuaveChains)

		const config = await getConfig(hre, taskArgs)
		console.log(`Sending oracle updates for the next ${config.nblocks} blocks`)
		console.log(`Holesky signer: ${config.holeskySigner.address}`)
		console.log(`Suave signer: ${config.suaveSigner.address}`)
		console.log(`Ticker: ${config.ticker}`)

		await submitOracleUpdates(config)
		// todo: add another thread that listens for oracle updates on the settlement layer
	})

async function submitOracleUpdates(c: ITaskConfig) {
	const controllerAddress = await c.oracleContract.controller()
	let lastHoleskyBlock = 0
	for (let i=0; i<c.nblocks; i++) {
		const holeskyBlockNum = await c.holeskySigner.provider.getBlockNumber()
		if (holeskyBlockNum <= lastHoleskyBlock) {
			await utils.sleep(2000)
			continue
		}
		lastHoleskyBlock = holeskyBlockNum
		const nextHoleskyBlock = holeskyBlockNum + 1
		console.log(`${i} | Submitting for Holesky block: ${nextHoleskyBlock}`)
		await submitOracleUpdate(c, controllerAddress, nextHoleskyBlock)
	}
}

async function submitOracleUpdate(c: ITaskConfig, controllerAddress: string, nextHoleskyBlock: number) {
	try {
		const gasPrice = await c.holeskySigner.provider.getGasPrice().then(p => p.toHexString())
		const nonce = await c.holeskySigner.provider.getTransactionCount(controllerAddress)
		const submissionRes = await c.oracleContract.queryAndSubmit.sendCCR(
			c.ticker,
			nonce,
			gasPrice,
			nextHoleskyBlock,
			c.privateSubmission
		)
		const receipt = await submissionRes.wait()
		if (receipt.status === 0) {
			throw new Error('Oracle update submission failed')
		}
	} catch (err) {
		console.log(err)
	}
}

interface ITaskConfig {
	nblocks: number,
	executionNodeAdd: string,
	holeskySigner: Wallet,
	suaveSigner: SuaveWallet,
	oracleContract: SuaveContract,
	ticker: string,
	privateSubmission: boolean
}

async function getConfig(hre: HRE, taskArgs: any): Promise<ITaskConfig> {
	const { nblocks, ticker, oracleContract: oc, privateSubmission } = await parseTaskArgs(hre, taskArgs)
	const executionNodeAdd = utils.getEnvValSafe('EXECUTION_NODE')
	const holeskySigner = utils.makeHoleskySigner()

	const networkConfig: any = hre.network.config
	const suaveProvider = new SuaveJsonRpcProvider(networkConfig.url)
	const suaveSigner = new SuaveWallet(networkConfig.accounts[0], suaveProvider)
	
	const oracleContract = new SuaveContract(
		oc.address, 
		oc.interface,
		suaveSigner
	)
	return {
		nblocks,
		ticker,
		executionNodeAdd,
		holeskySigner,
		suaveSigner,
		oracleContract,
		privateSubmission
	}
}

async function parseTaskArgs(hre: HRE, taskArgs: any) {
	const privateSubmission = taskArgs.privateSubmission
	const nblocks = parseInt(taskArgs.nblocks)
	const ticker = taskArgs.ticker
	if (!ticker) throw new Error('Ticker is required')

	const oracleContract = await (taskArgs.oracle
		? hre.ethers.getContractAt('BinanceOracle', taskArgs.oracle)
		: utils.fetchDeployedContract(hre, 'BinanceOracle')
	)

	return { nblocks, ticker, oracleContract, privateSubmission }
}