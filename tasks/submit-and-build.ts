import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types';
import { ethers, Wallet, BigNumber } from 'ethers';
import { task, types } from 'hardhat/config';

import { SUAVE_CHAIN_ID, PRECOMPILES } from '../src/const';
import * as utils from './utils';
import {
	BeaconPAListener, 
	getValidatorForSlot 
} from './beacon';
import {
	makeDummyBundleBytes,
	sendBidForBlock,
	Result
} from './send-bundles';
import {
	buildBlock, 
	makeBuildBlockArgs
} from './build-blocks';


task('submit-and-build', 'Submit bids, build blocks and send them to relay')
	.addOptionalParam("nslots", "Number of slots to build blocks for. Default is two.", 1, types.int)
	.addOptionalParam("builder", "Address of a Builder contract. By default fetch most recently deployed one.")
	.addOptionalParam("mevshare", "Address of a MevShare contract. By default fetch most recently deployed one.")
	.addOptionalParam("reward", "Proposer reward in ETH. Default is 0.01.", 0.01, types.float)
	.setAction(async function (taskArgs: any, hre: HRE) {
		utils.checkChain(hre, SUAVE_CHAIN_ID)
		const config = await getConfig(hre, taskArgs);

		console.log(`Sending blocks for the next ${config.nSlots} slots`)
		console.log(`Suave signer: ${config.suaveSigner.address}`)
		
		await beginBlockBuilding(config)
	})

async function beginBlockBuilding(c: ITaskConfig) {
	const paListener = new BeaconPAListener()
	let lastNextBlock = null
	for (let i=0; i < c.nSlots; i++) {
		console.log()	
		const payload = await paListener.waitForNextSlot()
		const validator = await getValidatorForSlot(c.relayUrl, payload.data.proposal_slot)
		if (validator === null) {
			console.log(`🤷 Can't find validator for slot ${payload.data.proposal_slot}, skipping`)
			i--; continue
		}
		const buildBlockArgs = makeBuildBlockArgs(payload.data, validator)
		const nextBlockNum = payload.data.parent_block_number + 1
		console.log("👷‍ Next block-num:", nextBlockNum)
		if (lastNextBlock !== nextBlockNum) {
			lastNextBlock = nextBlockNum
			process.stdout.write('📩 Sending bid ...')
			const [success, err] = await submitBid(c, nextBlockNum, validator.feeRecipient)
			if (success) {
				console.log("✅")
				success.then(console.log)
			} else {
				console.log('❌')
				console.log(err)
				i--; continue
			}
		}
		process.stdout.write('👷 Building block ...')
		const [success, err] = await buildBlock(c, buildBlockArgs, nextBlockNum)
		if (success) {
			console.log("✅")
			success.then(console.log)
		} else {
			console.log('❌')
			console.log(err)
		}
	}
	
}

async function submitBid(c: ITaskConfig, blockHeight: number, feeRecipient: string): Promise<Result<Promise<string>>> {
	const confidentialBytes = await makeConfidentialBytes(c.goerliSigner, feeRecipient, c.reward)
	const allowedPeekers = [ c.mevshareAdd, c.builderAdd, PRECOMPILES.buildEthBlock ]

	const result = await sendBidForBlock(
		c.suaveSigner,
		c.executionNodeAdd, 
		c.mevshareAdd, 
		confidentialBytes, 
		blockHeight, 
		allowedPeekers, 
		[]
	)
	return result
}

async function makeConfidentialBytes(signer: Wallet, proposerAdd: string, reward: BigNumber) {
	signer.provider.getFeeData
	const expectedGas = 23000
	const expectedBaseFee = await utils.getNextBaseFee(signer.provider)
	const gasPrice = reward.div(expectedGas).add(expectedBaseFee)
	const nonce = await signer.getTransactionCount();
	const tx = {
		nonce,
		from: signer.address,
		to: proposerAdd,
		gasPrice,
		gasLimit: expectedGas,
		chainId: 5,
	};
	const signedTx = await signer.signTransaction(tx);
	return makeDummyBundleBytes(signedTx)
}

interface ITaskConfig {
	nSlots: number,
	builderAdd: string,
	mevshareAdd: string,
	executionNodeAdd: string,
	suaveSigner: Wallet,
	goerliSigner: Wallet,
	relayUrl: string,
	beaconUrl: string,
	reward: BigNumber,
}

async function getConfig(hre: HRE, taskArgs: any): Promise<ITaskConfig> {
	const { nSlots, builderAdd, mevshareAdd, reward } = await parseTaskArgs(hre, taskArgs)
	const executionNodeAdd = utils.getEnvValSafe('EXECUTION_NODE');
	const relayUrl = utils.getEnvValSafe('GOERLI_RELAY');
	const beaconUrl = utils.getEnvValSafe('GOERLI_BEACON');
	const suaveSigner = utils.makeSuaveSigner();
	const goerliSigner = utils.makeGoerliSigner();
	return {
		executionNodeAdd,
		suaveSigner,
		goerliSigner,
		mevshareAdd,
		builderAdd,
		beaconUrl,
		relayUrl,
		nSlots,
		reward,
	}
}

async function parseTaskArgs(hre: HRE, taskArgs: any) {
	const nSlots = parseInt(taskArgs.nslots);
	const reward = ethers.utils.parseEther(taskArgs.reward.toString());
	const builderAdd = taskArgs.mevshare
		? taskArgs.mevshare
		: await utils.fetchDeployedContract(hre, 'Builder').then(c => c.address)
	const mevshareAdd = taskArgs.mevshare
		? taskArgs.mevshare
		: await utils.fetchDeployedContract(hre, 'MevShare').then(c => c.address)

	return { nSlots, builderAdd, mevshareAdd, reward }
}



