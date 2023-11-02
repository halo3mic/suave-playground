import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types';
import { task, types } from 'hardhat/config';
import { ethers, Wallet } from 'ethers';

import { SUAVE_CHAIN_ID } from '../src/const';
import { 
	ConfidentialComputeRequest, 
	ConfidentialComputeRecord 
} from '../src/confidential-types'
import * as utils from './utils';
import {
	BeaconPAListener, 
	BeaconEventData, 
	ValidatorMsg,
	getValidatorForSlot 
} from './beacon';


const abis = utils.fetchAbis()

task('build-blocks', 'Build blocks and send them to relay')
	.addOptionalParam("nslots", "Number of slots to build blocks for. Default is two.", 1, types.int)
	.addOptionalParam("builder", "Address of a Builder contract. By default fetch most recently deployed one.")
	.setAction(async function (taskArgs: any, hre: HRE) {
		utils.checkChain(hre, SUAVE_CHAIN_ID)
		const config = await getConfig(hre, taskArgs);

		console.log(`Sending blocks for the next ${config.nSlots} slots`)
		console.log(`Suave signer: ${config.suaveSigner.address}`)
		
		await beingBlockBuilding(config)
	})

async function beingBlockBuilding(c: ITaskConfig) {
	const paListener = new BeaconPAListener()

	for (let i=0; i < c.nSlots; i++) {
		const payload = await paListener.waitForNextSlot()
		const validator = await getValidatorForSlot(c.relayUrl, payload.data.proposal_slot)
		if (validator === null) {
			console.log(`No validator for slot ${payload.data.proposal_slot}, skipping`)
			i--; continue
		}
		const buildBlockArgs = makeBuildBlockArgs(payload.data, validator)
		const nextBlockNum = payload.data.parent_block_number + 1
		await buildBlock(c, buildBlockArgs, nextBlockNum)
	}
	
}

async function buildBlock(c: ITaskConfig, bbArgs: BuildBlockArgs, blockHeight: number): Promise<void> {
	console.log(bbArgs)
	const mevShareConfRec = await makeBlockBuildConfRec(c, bbArgs, blockHeight);
	const inputBytes = new ConfidentialComputeRequest(mevShareConfRec, '0x')
			.signWithWallet(c.suaveSigner)
			.rlpEncode()

	const [res, err] = await (c.suaveSigner.provider as any).send('eth_sendRawTransaction', [inputBytes])
		.then(r => [r, null])
		.catch(err => [null, err])

	if (err) {
		handleErr(err)
	} else {
		console.log(`tx: ${res}`)
		const receipt = await c.suaveSigner.provider.waitForTransaction(res)
		console.log(receipt)
	}
}

async function makeBlockBuildConfRec(
	c: ITaskConfig,
	bbArgs: BuildBlockArgs,
	blockHeight: number
): Promise<ConfidentialComputeRecord> {
	const calldata = buildMevShareCalldata(bbArgs, blockHeight);
	const nonce = await c.suaveSigner.getTransactionCount();
	return {
		chainId: SUAVE_CHAIN_ID,
		nonce,
		to: c.builderAdd,
		value: ethers.utils.parseEther('0'),
		gas: ethers.BigNumber.from(10000000),
		gasPrice: ethers.utils.parseUnits('20', 'gwei'),
		data: calldata, 
		executionNode: c.executionNodeAdd,
	};
}

function buildMevShareCalldata(bbArgs: BuildBlockArgs, blockHeight: number) {
	const mevshareInterface = new ethers.utils.Interface(abis['EthBlockBidSenderContract'])
	const blockArgs = [
		bbArgs.slot,
		bbArgs.proposerPubkey,
		bbArgs.parent,
		bbArgs.timestamp,
		bbArgs.feeRecipient,
		bbArgs.gasLimit,
		bbArgs.random,
		bbArgs.withdrawals.map(w => [ w.index, w.validator, w.address, w.amount ]),
	]
	const calldata = mevshareInterface.encodeFunctionData('buildMevShare', [blockArgs, blockHeight])
	return calldata
}

interface BuildBlockArgs {
	slot: number;
	proposerPubkey: string;
	parent: string;
	timestamp: number;
	feeRecipient: string;
	gasLimit: number;
	random: string;
	withdrawals: Withdrawal[];
}

interface Withdrawal {
	index: number;
	validator: number;
	address: string;
	amount: number;
}

function makeBuildBlockArgs(beacon: BeaconEventData, validator: ValidatorMsg): BuildBlockArgs {
	const withdrawals = beacon.payload_attributes.withdrawals.map(w => {
		return {
			index: w.index,
			validator: w.validator_index,
			address: w.address,
			amount: w.amount,
		}
	})
	return {
		withdrawals,
		slot: beacon.proposal_slot,
		parent: beacon.parent_block_hash,
		timestamp: beacon.payload_attributes.timestamp,
		random: beacon.payload_attributes.prev_randao,
		feeRecipient: validator.feeRecipient,
		gasLimit: validator.gasLimit,
		proposerPubkey: validator.pubkey,
	}
	
}

interface ITaskConfig {
	nSlots: number,
	builderAdd: string,
	executionNodeAdd: string,
	suaveSigner: Wallet,
	relayUrl: string,
	beaconUrl: string,
}

async function getConfig(hre: HRE, taskArgs: any): Promise<ITaskConfig> {
	const { nSlots, builderAdd } = await parseTaskArgs(hre, taskArgs)
	const executionNodeAdd = utils.getEnvValSafe('EXECUTION_NODE');
	const relayUrl = utils.getEnvValSafe('GOERLI_RELAY');
	const beaconUrl = utils.getEnvValSafe('GOERLI_BEACON');
	const suaveSigner = utils.makeSuaveSigner();
	return {
		executionNodeAdd,
		suaveSigner,
		builderAdd,
		beaconUrl,
		relayUrl,
		nSlots,
	}
}

async function parseTaskArgs(hre: HRE, taskArgs: any) {
	const nSlots = parseInt(taskArgs.nslots);
	const builderAdd = taskArgs.mevshare
		? taskArgs.mevshare
		: await utils.fetchDeployedContract(hre, 'Builder').then(c => c.address)

	return { nSlots, builderAdd }
}

function handleErr(err) {
	const rpcErr = JSON.parse(err.body)?.error?.message
	if (rpcErr && rpcErr.startsWith('execution reverted: ')) {
		const revertMsg = rpcErr.slice('execution reverted: '.length)
		const decodedErr = new ethers.utils.Interface(abis['EthBlockBidSenderContract'])
			.decodeErrorResult(revertMsg.slice(0, 10), revertMsg)
		if (revertMsg.startsWith('0x75fff467')) {
			const errStr = Buffer.from(decodedErr[1].slice(2), 'hex').toString()
			console.log(`❗️ PeekerReverted(${decodedErr[0]}, '${errStr})'`)
		} else {
			console.log(decodedErr)
		}
		console.log(rpcErr)
	} else {
		console.log(rpcErr)
	}
}