import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types'
import { task } from 'hardhat/config'
import { ethers } from 'ethers'

import { supportedSuaveChains } from './utils/const'
import { SuaveContract } from 'ethers-suave'
import * as utils from './utils'


// todo: handle duplicate code in tasks/adblock.ts

task('block-ad-init', 'Initialize the BlockAdAuction contract')
	.addOptionalParam('blockad', 'Address of a BlockAd contract. By default fetch most recently deployed one.')
	.setAction(async function (taskArgs: any, hre: HRE) {
		utils.checkChain(hre, supportedSuaveChains)
		const contract = await getBlockAdContract(hre, taskArgs.blockad)
		await confidentialInit(contract)
	})

async function confidentialInit(contract: SuaveContract): Promise<boolean> {
	const ccrPromise = contract.confidentialConstructor.sendCCR()
	console.log('Sending init tx')
	return utils.prettyPromise(ccrPromise, contract, 'Initializing BlockAdAuction')
		.then(utils.handleResult)
}

async function getBlockAdContract(hre: HRE, blockad?: string): Promise<SuaveContract> {
	const chainId = utils.getNetworkChainId(hre)
	const suaveSigner = utils.makeSuaveSigner(chainId)
	const blockadContract = blockad
		? await hre.ethers.getContractAt('BlockAdAuctionV2', blockad)
		: await utils.fetchDeployedContract(hre, 'BlockAdAuctionV2')
	return new SuaveContract(
		blockadContract.address,
		blockadContract.interface,
		suaveSigner
	)
}