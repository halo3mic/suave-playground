import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types'
import { task, types } from 'hardhat/config'
import { ethers } from 'ethers'

import { SuaveContract } from 'ethers-suave'
import * as utils from './utils'
import {
	getValidatorForSlot,
	BeaconPAListener, 
	BeaconEventData, 
	ValidatorMsg,
} from './utils/beacon'
import { supportedSuaveChains } from './utils/const'

// todo: make build lib
// todo: instead of tasks config use build config object - only relevant params

type PreCall = (nextBlockNum: number) => Promise<boolean>
interface IBuildOptions {
	precall?: PreCall
	method?: string,
}

task('build-blocks', 'Build blocks and send them to relay')
	.addOptionalParam('nslots', 'Number of slots to build blocks for.', 1, types.int)
	.addOptionalParam('builder', 'Address of a Builder contract. By default fetch most recently deployed one.')
	.addFlag('blockad', 'Whether to build blocks for ad-bids')
	.addFlag('resubmit', 'Whether to resubmit to relay on err `payload attributes not (yet) known`')
	.setAction(async function (taskArgs: any, hre: HRE) {
		utils.checkChain(hre, supportedSuaveChains)
		const config = await getConfig(hre, taskArgs)

		console.log(`Sending blocks for the next ${config.nSlots} slots`)
		console.log(`Suave signer: ${config.suaveSignerAddress}`)
		
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
		if (opt?.precall) {
			await opt.precall(i)
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
	const buildArgs = makeBuildArgs(bbArgs, blockHeight)
	const method = bopt?.method || 'buildMevShare'  // todo why this default?
	const promise = c.builder[method].sendConfidentialRequest(...buildArgs)
	return utils.prettyPromise(promise, c.builder, 'Building block')
}

function makeBuildArgs(bbArgs: BuildBlockArgs, blockHeight: number) {
	const fillPending = true
	const buildArgs =  [
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
	return [buildArgs, blockHeight]
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
	builder: SuaveContract,
	suaveSignerAddress: string,
	relayUrl: string,
	beaconUrl: string,
	buildOpts?: IBuildOptions,
	resubmit?: boolean,
}

async function getConfig(hre: HRE, taskArgs: any): Promise<ITaskConfig> {
	const hhChainId = utils.getNetworkChainId(hre)
	const { builderContract, ...cliConfig } = await parseTaskArgs(hre, taskArgs)
	const { suaveSigner, ...envConfig } = await getEnvConfig(hhChainId)
	const suaveSignerAddress = await suaveSigner.getAddress()
	const builder = new SuaveContract(
		builderContract.address,
		builderContract.interface,
		suaveSigner
	)
	return {
		...envConfig,
		...cliConfig,
		suaveSignerAddress,
		builder,
	}
}

export async function getEnvConfig(hhChainId: number) {
	const relayUrl = utils.getEnvValSafe('HOLESKY_RELAY')
	const beaconUrl = utils.getEnvValSafe('HOLESKY_BEACON')
	const suaveSigner = utils.makeSuaveSigner(hhChainId)
	return { suaveSigner, beaconUrl, relayUrl }
}

async function parseTaskArgs(hre: HRE, taskArgs: any) {
	const nSlots = parseInt(taskArgs.nslots)
	const resubmit = !!taskArgs.resubmit
	const [ builderCName, methodName ] = taskArgs.blockad 
		? [ 'BlockAdAuctionV2', 'buildBlock' ] 
		: [ 'Builder', 'buildMevShare' ] // todo why this default?
	const builderContract = taskArgs.builder
		? await hre.ethers.getContractAt(builderCName, taskArgs.builder)
		: await utils.fetchDeployedContract(hre, builderCName)
	const buildOpts = { method: methodName }

	return { nSlots, resubmit, builderContract, buildOpts }
}