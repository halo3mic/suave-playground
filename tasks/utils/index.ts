import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types'
import { ethers, Wallet, BigNumber } from 'ethers'

import {
	ConfidentialTransactionResponse,
	SuaveJsonRpcProvider,
	SuaveContract,
	SuaveWallet, 
} from 'ethers-suave'
import { RIGIL_CHAIN_ID, TOLIMAN_CHAIN_ID } from './const'


export type Result<T> = [T, null] | [null, string]

export interface IBundle {
	txs: Array<string>,
	revertingHashes: Array<string>,
}

export async function makePaymentBundleBytes(signer: Wallet, reward: BigNumber): Promise<string> {
	return makeSimplePaymentTx(signer, reward).then(txToBundleBytes)
}

export async function makeSimplePaymentTx(signer: Wallet, reward: BigNumber): Promise<string> {
	const expectedGas = 21000
	const expectedBaseFee = await getNextBaseFee(signer.provider)
	const gasPrice = reward.div(expectedGas).add(expectedBaseFee)
	const nonce = await signer.getTransactionCount()
	const chainId = await signer.getChainId()
	const tx = {
		nonce,
		from: signer.address,
		to: signer.address,
		gasPrice,
		gasLimit: expectedGas,
		chainId,
	}
	const signedTx = await signer.signTransaction(tx)
	return signedTx
}

export function txToBundleBytes(signedTx): string {
	const bundle = txToBundle(signedTx)
	const bundleBytes = bundleToBytes(bundle)
	return bundleBytes
}

export function txToBundle(signedTx): IBundle {
	return {
		txs: [signedTx],
		revertingHashes: [],
	}
}

export function bundleToBytes(bundle: IBundle): string {
	const bundleBytes = Buffer.from(JSON.stringify(bundle), 'utf8')
	const confidentialDataBytes = ethers.utils.defaultAbiCoder.encode(['bytes'], [bundleBytes])
	return confidentialDataBytes
}

export function makeHoleskySigner() {
	return makeSigner(getEnvValSafe('HOLESKY_RPC'), getEnvValSafe('HOLESKY_PK'))
}

export function makeSuaveSigner(hhChainId: number): SuaveWallet {
	const [ rpc, pk ] = (() => {
		switch (hhChainId) {
		case RIGIL_CHAIN_ID:
			return ['RIGIL_RPC', 'RIGIL_PK']
		case TOLIMAN_CHAIN_ID:
			return ['TOLIMAN_RPC', 'TOLIMAN_PK']
		default:
			return ['SUAVE_RPC', 'SUAVE_PK']
		}
	})()
	const provider = new SuaveJsonRpcProvider(getEnvValSafe(rpc))
	const wallet = new SuaveWallet(getEnvValSafe(pk), provider)
	return wallet
}

function getEnvValSafe(key: string): string {
	const endpoint = process.env[key]
	if (!endpoint)
		throw(`Missing env var ${key}`)
	return endpoint
}

export function makeSigner(rpcUrl: string, pk: string) {
	const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
	const signer = new ethers.Wallet(pk, provider)
	return signer
}

export async function fetchDeployedContract(hre: HRE, deploymentName: string) {
	return (hre as any).ethers.getContract(deploymentName) 
}

export function checkChain(hre: HRE, desiredChains: number[]) {
	const chainId = getNetworkChainId(hre)
	if (chainId && !desiredChains.includes(chainId)) {
		throw Error(`Expected one of ${desiredChains}; got ${chainId}`)
	}
}

export function getNetworkChainId(hre: HRE) {
	return hre.network.config.chainId
}

export function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}

export async function getNextBaseFee(provider: ethers.providers.Provider): Promise<number> {
	return provider.getBlock('pending').then(b =>{
		const bfee = b?.baseFeePerGas
		if (!bfee)
			throw Error('No baseFeePerGas')
		return bfee.toNumber()	
	})
}

export async function prettyPromise(
	promise: Promise<ConfidentialTransactionResponse>,
	contract: SuaveContract,
	label_?: string
): Promise<Result<Promise<string>>> {
	const label: string = label_ ? `'${label_}'` : ''
	return promise
		.then(async r => {
			const success = handleNewSubmission(r, contract, label)
			return [success, null] as Result<Promise<string>>
		})
		.catch(err => {
			const error = handleSubmissionErr(contract, err, label)
			return [null, error] as Result<Promise<string>>
		})
}


export async function handleNewSubmission(
	response: ConfidentialTransactionResponse, 
	contract: SuaveContract, 
	label: string
): Promise<string> {
	const receipt = await response.wait()
	let output = `\t${label} Tx ${response.hash} confirmed:`
	if (receipt.status === 0) {
		output += '\t❌ Tx execution failed'
		output += `\n\t${JSON.stringify(receipt)}`
	} else {
		const tab = n => '\t  '.repeat(n)
		output += '\n\t✅ Tx execution succeeded\n'
		receipt.logs.forEach(log => {
			try {
				const parsedLog = contract.interface.parseLog({data: log.data, topics: log.topics as string[]})
				output += `${tab(1)}${parsedLog.name}\n`
				parsedLog.fragment.inputs.forEach((input, i) => {
					output += `${tab(2)}${input.name}: ${parsedLog.args[i]}\n`
				})
			} catch {
				output += `${tab(1)}${log.topics[0]}\n`
				output += `${tab(2)}${log.data}\n`
			}

		})
	}

	return output + '\n'
}

export function handleSubmissionErr(
	contract: SuaveContract, 
	err: any, 
	label: string
): string {
	if (err.body) {
		const rpcErr = JSON.parse(err.body)?.error?.message
		if (rpcErr && rpcErr.startsWith('execution reverted: ')) {
			const revertMsg = rpcErr.slice('execution reverted: '.length)
			if (revertMsg != '0x') {
				try {
					const err = contract.interface.parseError(revertMsg)
					if (err.signature == 'PeekerReverted(address,bytes)') {
						const errStr = Buffer.from(err.args[1].slice(2), 'hex').toString()
						return `\t❗️ ${label} PeekerReverted(${err.args[0]}, '${errStr})'`
					}
					return `\t❗️ ${label} ${err.signature}(${err.args.map(a => `'${a}'`).join(',')})`
				} catch {
					return `\t❗️ ${label} ${rpcErr}`
				}
			}
		}
	}
	return `\t❗️ ${label} ` + err
}


export async function handleResult<T>(result: Result<Promise<T>>): Promise<boolean> {
	const [s, e] = result
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

export function getRandomStr() {
	const ranInt = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
	return ranInt.toString(16)
}

export { getEnvValSafe }