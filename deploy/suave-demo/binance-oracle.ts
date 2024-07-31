import { SuaveJsonRpcProvider, SuaveWallet, SuaveContract } from 'ethers-suave'
import { ethers } from 'hardhat'
import * as hh from 'hardhat'
import { makeDeployCallback, DeployOptions } from '../deploy-utils'
import { getEnvValSafe } from '../../tasks/utils'

const deployOptions: DeployOptions = {
	name: 'BinanceOracle', 
	contractName: 'BinanceOracle', 
	args: [ ], 
	tags: [ 'binance-oracle' ]
}

const beforeCallback = async () => {
	const isSettlementDeployed = !!(await (hh.companionNetworks['holesky'] as any)
		.deployments.getOrNull('OracleSettlementContract'))
	if (!isSettlementDeployed) {
		throw new Error('OracleSettlementContract must be deployed first')
	}
}

const afterCallaback = async (deployments: any, deployResult: any) => {
	const holeskyProvider = new ethers.providers.JsonRpcProvider(getEnvValSafe('HOLESKY_RPC'))
	const holeskySigner = new ethers.Wallet(getEnvValSafe('HOLESKY_PK'), holeskyProvider)

	const networkConfig: any = hh.network.config
	const suaveProvider = new SuaveJsonRpcProvider(networkConfig.url)
	const suaveWallet = new SuaveWallet(networkConfig.accounts[0], suaveProvider)
	const OracleContract = new SuaveContract(deployResult.address, deployResult.abi, suaveWallet)

	deployments.log('\t1.) Initalizing OracleContract')
	const isInitiated = await OracleContract.isInitialized()
	if (!isInitiated) {
		const initRes = await OracleContract.confidentialConstructor.sendCCR()
		const receipt = await initRes.wait()
		if (receipt.status == 0)
			throw new Error('ConfidentialInit callback failed')
	}
    
	deployments.log('\t2.) Sending controller funds for gas')
	const controllerAddress = await OracleContract.controller()
	await holeskySigner.sendTransaction({
		to: controllerAddress,
		value: ethers.utils.parseEther('0.02')
	})
		.then(tx => tx.wait())
		.then(receipt => {
			if (!receipt.status) {
				throw new Error('Failed to send gas to controller')
			}
		})

	deployments.log('\t3.) Registering settlement contract')
	const OracleSettlementContract = await (hh.companionNetworks['holesky'] as any)
		.deployments.get('OracleSettlementContract')
	const registerRes = await OracleContract.registerSettlementContract
		.sendCCR(OracleSettlementContract.address)
	const registerReceipt = await registerRes.wait()
	if (registerReceipt.status == 0)
		throw new Error('ConfidentialInit callback failed')

	console.log(`Controller: ${controllerAddress} | SettlementContract: ${OracleSettlementContract.address}`)
	console.log('Complete 🎉')
}


module.exports = makeDeployCallback(deployOptions, beforeCallback, afterCallaback)



