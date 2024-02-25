import { SuaveProvider, SuaveWallet, SuaveContract } from 'ethers-suave'
import { ethers } from 'hardhat'
import * as hh from 'hardhat'
import { makeDeployCallback, DeployOptions } from '../deploy-utils'
import { getEnvValSafe } from '../../src/utils'

const deployOptions: DeployOptions = {
	name: 'BinanceOracle', 
	contractName: 'BinanceOracle', 
	args: [ ], 
	tags: [ 'binance-oracle' ]
}

const beforeCallback = async ({}) => {
    const isSettlementDeployed = !!(await (hh.companionNetworks['goerli'] as any)
        .deployments.getOrNull('OracleSettlementContract'))
    if (!isSettlementDeployed) {
        throw new Error('OracleSettlementContract must be deployed first')
    }
}

const afterCallaback = async (deployments: any, deployResult: any) => {
    const goerliProvider = new ethers.providers.JsonRpcProvider(getEnvValSafe('GOERLI_RPC'))
    const goerliSigner = new ethers.Wallet(getEnvValSafe('GOERLI_PK'), goerliProvider)

    const networkConfig: any = hh.network.config
    const suaveProvider = new SuaveProvider(
        networkConfig.url, 
        getEnvValSafe('EXECUTION_NODE') // todo: make variable (now needs to be changed in .env)
    )
    const suaveWallet = new SuaveWallet(networkConfig.accounts[0], suaveProvider)
    const OracleContract = new SuaveContract(deployResult.address, deployResult.abi, suaveWallet)

    // 1. Init the Oracle
    deployments.log('\t1.) Initalizing OracleContract')
    const initRes = await OracleContract.confidentialConstructor
        .sendConfidentialRequest({})
    const receipt = await initRes.wait()
    if (receipt.status == 0)
        throw new Error('ConfidentialInit callback failed')
    
    // 2. Pay the controller for gas on the settlement chain 
    deployments.log('\t2.) Sending controller funds for gas')
    const controllerAddress = await OracleContract.controller()
    await goerliSigner.sendTransaction({
            to: controllerAddress,
            value: ethers.utils.parseEther('0.02')
        })
        .then(tx => tx.wait())
        .then(receipt => {
            if (!receipt.status) {
                throw new Error('Failed to send gas to controller')
            }
        })

    // 3. Register the settlement contract
    deployments.log('\t3.) Registering settlement contract')
    const OracleSettlementContract = await (hh.companionNetworks['goerli'] as any)
        .deployments.get('OracleSettlementContract')
    const registerRes = await OracleContract.registerSettlementContract
        .sendConfidentialRequest(OracleSettlementContract.address)
    const registerReceipt = await registerRes.wait()
    if (registerReceipt.status == 0)
        throw new Error('ConfidentialInit callback failed')

    console.log(`Controller: ${controllerAddress} | SettlementContract: ${OracleSettlementContract.address}`)
    console.log('Complete 🎉')
}


module.exports = makeDeployCallback(deployOptions, beforeCallback, afterCallaback)



