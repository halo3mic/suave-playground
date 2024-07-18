import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types'
import { task, types } from 'hardhat/config'
import { ethers, Wallet } from 'ethers'

import { 
	ConfidentialComputeRequest, 
	ConfidentialComputeRecord 
} from '../src/confidential-types'
import { SUAVE_CHAIN_ID, RIGIL_CHAIN_ID, TOLIMAN_CHAIN_ID } from './utils/const'
import * as utils from './utils'
import {
	BeaconPAListener, 
	BeaconEventData, 
	ValidatorMsg,
	getValidatorForSlot 
} from './utils/beacon'


type PreCall = (nextBlockNum: number) => Promise<boolean>
interface IBuildOptions {
	precall?: PreCall
	iface?: ethers.utils.Interface,
	method?: string,
}
const builderInterface = utils.getInterface('EthBlockBidSenderContract')
const adbidInterface = utils.getInterface('BlockAdAuctionV2')

task('build-blocks', 'Build blocks and send them to relay')
	.addOptionalParam('nslots', 'Number of slots to build blocks for.', 1, types.int)
	.addOptionalParam('builder', 'Address of a Builder contract. By default fetch most recently deployed one.')
	.addFlag('blockad', 'Whether to build blocks for ad-bids')
	.addFlag('resubmit', 'Whether to resubmit to relay on err `payload attributes not (yet) known`')
	.setAction(async function (taskArgs: any, hre: HRE) {
		utils.checkChain(hre, [SUAVE_CHAIN_ID, RIGIL_CHAIN_ID, TOLIMAN_CHAIN_ID])
		const config = await getConfig(hre, taskArgs)

		console.log(`Sending blocks for the next ${config.nSlots} slots`)
		console.log(`Suave signer: ${config.suaveSigner.address}`)
		
		await doBlockBuilding(config, config.buildOpts)
	})

export async function doBlockBuilding(c: ITaskConfig, opt?: IBuildOptions) {
	const paListener = new BeaconPAListener()

	for (let i=0; i < c.nSlots; i++) {
		const payload = await paListener.waitForNextSlot()
		const validator = await getValidatorForSlot(c.relayUrl, payload.data.proposal_slot)
		if (validator === null) {
			console.log(`👷‍ No validator found for slot ${payload.data.proposal_slot}, skipping`)
			i--; continue
		}
		// ! This could cause latency and missed slots
		if (opt?.precall) {
			const isSuccess = await opt.precall(i)
			if (!isSuccess) {
				await utils.sleep(2000)
				continue
			}
		}

		const buildBlockArgs = makeBuildBlockArgs(payload.data, validator)
		const nextBlockNum = payload.data.parent_block_number + 1
		await build(c, buildBlockArgs, nextBlockNum, opt)
	}
	
}

async function build(
	c: ITaskConfig,
	bbArgs: BuildBlockArgs, 
	blockHeight: number,
	bopt: IBuildOptions = null
): Promise<boolean> {
	process.stdout.write(`👷‍ Building block for slot ${bbArgs.slot} (block ${blockHeight})... `)
	for(;;) {
		let [s, e] = await buildBlock(c, bbArgs, blockHeight, bopt)
		if (s) {
			console.log('✅')
			await s.then(console.log)
			return true
		} else {
			if (c.resubmit && e.includes('{"code":400,"message":"payload attributes not (yet) known"}')) {
				process.stdout.write('⏳ Resubmitting ... ')
				const re = /\(yet\) known"\}\n','(?<builderBid>.*)'\)/
				const builderBid = e.match(re)?.groups?.builderBid
				if (builderBid) {
					const bid = Buffer.from(builderBid.slice(2), 'hex').toString('utf8')
					console.log(JSON.stringify(JSON.parse(bid), null, 2))
					// ;[s, e] = await submitBlock(c, builderBid, bbArgs.slot, bopt)
					// continue
				}
				await utils.sleep(3000)
				;[s, e] = await buildBlock(c, bbArgs, blockHeight, bopt)
				continue
			}
			console.log('❌')
			console.log(e)
			return false
		}
	}
}

export async function buildBlock(
	c: ITaskConfig,
	bbArgs: BuildBlockArgs, 
	blockHeight: number,
	bopt: IBuildOptions = null
): Promise<utils.Result<Promise<string>>> {
	const mevShareConfRec = await makeBlockBuildConfRec(c, bbArgs, blockHeight, bopt?.iface, bopt?.method)
	const inputBytes = new ConfidentialComputeRequest(mevShareConfRec, '0x')
		.signWithWallet(c.suaveSigner)
		.rlpEncode()
	const iface = bopt?.iface || builderInterface
	const result = await utils.submitRawTxPrettyRes(c.suaveSigner.provider, inputBytes, iface, 'BlockBuilding')
	return result
}

// async function submitBlock(
// 	c: ITaskConfig, 
// 	builderBid: string, 
// 	slot: number, 
// 	bopt: IBuildOptions = null
// ) {
// 	const iface = bopt?.iface || builderInterface
// 	const calldata = iface.encodeFunctionData('submitBlock', [slot])
// 	const confRec = await utils.createConfidentialComputeRecord(
// 		c.suaveSigner,
// 		calldata,
// 		c.executionNodeAdd,
// 		c.builderAdd,
// 	)
// 	console.log('Resubmitting block with builder bid', builderBid)
// 	const inputBytes = new ConfidentialComputeRequest(confRec, builderBid)
// 		.signWithWallet(c.suaveSigner)
// 		.rlpEncode()
// 	const result = await utils.submitRawTxPrettyRes(c.suaveSigner.provider, inputBytes, iface, 'Submitting block')
// 	return result
// }

async function makeBlockBuildConfRec(
	c: ITaskConfig,
	bbArgs: BuildBlockArgs,
	blockHeight: number,
	iface: ethers.utils.Interface = null,
	method: string = null
): Promise<ConfidentialComputeRecord> {
	const calldata = makeCalldata(bbArgs, blockHeight, iface, method)
	return utils.createConfidentialComputeRecord(
		c.suaveSigner, 
		calldata, 
		c.executionNodeAdd, 
		c.builderAdd, 
	)
}

function makeCalldata(
	bbArgs: BuildBlockArgs, 
	blockHeight: number,
	iface?: ethers.utils.Interface, 
	method?: string
) {
	const fillPending = false
	const blockArgs = [
		bbArgs.slot,
		bbArgs.proposerPubkey,
		bbArgs.parent,
		bbArgs.timestamp,
		bbArgs.feeRecipient,
		bbArgs.gasLimit,
		bbArgs.random,
		bbArgs.withdrawals.map(w => [ w.index, w.validator, w.address, w.amount ]),
		ethers.constants.HashZero,
		bbArgs.parentBeaconBlockRoot,
		fillPending,
	]
	if (!method)
		method = 'buildMevShare'
	if (!iface)
		iface = builderInterface
	const calldata = iface.encodeFunctionData(method, [blockArgs, blockHeight])
	return calldata
}

export interface BuildBlockArgs {
	slot: number;
	proposerPubkey: string;
	parent: string;
	timestamp: number;
	feeRecipient: string;
	gasLimit: number;
	random: string;
	withdrawals: Withdrawal[];
	parentBeaconBlockRoot: string;
}

interface Withdrawal {
	index: number;
	validator: number;
	address: string;
	amount: number;
}

export function makeBuildBlockArgs(beacon: BeaconEventData, validator: ValidatorMsg): BuildBlockArgs {
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
		parentBeaconBlockRoot: beacon.payload_attributes.parent_beacon_block_root,
	}
	
}

export interface ITaskConfig {
	nSlots: number,
	builderAdd: string,
	executionNodeAdd: string,
	suaveSigner: Wallet,
	relayUrl: string,
	beaconUrl: string,
	buildOpts?: IBuildOptions,
	resubmit?: boolean,
}

async function getConfig(hre: HRE, taskArgs: any): Promise<ITaskConfig> {
	const hhChainId = utils.getNetworkChainId(hre)
	const cliConfig = await parseTaskArgs(hre, taskArgs)
	const envConfig = await getEnvConfig(hhChainId)
	return {
		...envConfig,
		...cliConfig,
	}
}

export async function getEnvConfig(hhChainId: number) {
	const relayUrl = utils.getEnvValSafe('HOLESKY_RELAY')
	const beaconUrl = utils.getEnvValSafe('HOLESKY_BEACON')
	const suaveSigner = utils.makeSuaveSigner(hhChainId)
	const executionNodeAdd = await (suaveSigner.provider as any)
		.send('eth_kettleAddress', [])
		.then((res: string[]) => res[0])

	return {
		executionNodeAdd,
		suaveSigner,
		beaconUrl,
		relayUrl,
	}
}

async function parseTaskArgs(hre: HRE, taskArgs: any) {
	const nSlots = parseInt(taskArgs.nslots)
	const builderCName = taskArgs.blockad ? 'BlockAdAuctionV2' : 'Builder'
	const builderAdd = taskArgs.builder
		? taskArgs.builder
		: await utils.fetchDeployedContract(hre, builderCName).then(c => c.address)
	const buildOpts = taskArgs.blockad 
		? { iface: adbidInterface, method: 'buildBlock' } 
		: null
	const resubmit = !!taskArgs.resubmit

	return { nSlots, builderAdd, buildOpts, resubmit }
}