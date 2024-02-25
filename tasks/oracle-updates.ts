import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types'
import { task, types } from 'hardhat/config'
import { Wallet } from 'ethers'

import { SuaveProvider, SuaveWallet, SuaveContract } from 'ethers-suave'
import { SUAVE_CHAIN_ID, RIGIL_CHAIN_ID } from './utils/const'
import * as utils from './utils'


task('oracle-updates', 'Send Binance oracle updates for the next N blocks')
	.addParam('ticker', 'Binance ticker of the asset to update')
	.addOptionalParam('nblocks', 'Number of blocks to send bundles for. Default is two.', 1, types.int)
	.addOptionalParam('oracle', 'Address of the oracle contract. By default fetch most recently deployed one.')
	.setAction(async function (taskArgs: any, hre: HRE) {
		utils.checkChain(hre, [SUAVE_CHAIN_ID, RIGIL_CHAIN_ID])

		const config = await getConfig(hre, taskArgs)
		console.log(`Sending oracle updates for the next ${config.nblocks} blocks`)
		console.log(`Goerli signer: ${config.goerliSigner.address}`)
		console.log(`Suave signer: ${config.suaveSigner.address}`)
		console.log(`Ticker: ${config.ticker}`)

		await submitOracleUpdates(config)
		// todo: add another thread that listens for oracle updates on the settlement layer
	})

async function submitOracleUpdates(c: ITaskConfig) {
	const controllerAddress = await c.oracleContract.controller()
	for (let i=0; i<c.nblocks; i++) {
		const nextGoerliBlock = (await c.goerliSigner.provider.getBlockNumber()) + 1
		console.log(`${i} | Submitting for Goerli block: ${nextGoerliBlock}`)
		await submitOracleUpdate(c, controllerAddress, nextGoerliBlock)
	}
}

async function submitOracleUpdate(c: ITaskConfig, controllerAddress: string, nextGoerliBlock: number) {
	try {
		const gasPrice = await c.goerliSigner.provider.getGasPrice().then(p => p.toHexString())
		const nonce = await c.goerliSigner.provider.getTransactionCount(controllerAddress)
		const submissionRes = await c.oracleContract.queryAndSubmit.sendConfidentialRequest(
			c.ticker,
			nonce,
			gasPrice,
			nextGoerliBlock
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
	goerliSigner: Wallet,
	suaveSigner: SuaveWallet,
	oracleContract: SuaveContract,
	ticker: string,
}

async function getConfig(hre: HRE, taskArgs: any): Promise<ITaskConfig> {
	const { nblocks, ticker, oracleContract: oc } = await parseTaskArgs(hre, taskArgs)
	const executionNodeAdd = utils.getEnvValSafe('EXECUTION_NODE')
	const goerliSigner = utils.makeGoerliSigner()

	const networkConfig: any = hre.network.config
	const suaveProvider = new SuaveProvider(networkConfig.url, executionNodeAdd)
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
		goerliSigner,
		suaveSigner,
		oracleContract
	}
}

async function parseTaskArgs(hre: HRE, taskArgs: any) {
	const nblocks = parseInt(taskArgs.nblocks)
	const ticker = taskArgs.ticker
	if (!ticker) throw new Error('Ticker is required')

	const oracleContract = await (taskArgs.oracle
		? hre.ethers.getContractAt('BinanceOracle', taskArgs.oracle)
		: utils.fetchDeployedContract(hre, 'BinanceOracle')
	)

	return { nblocks, ticker, oracleContract }
}