import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types'
import { ethers, Wallet, BigNumber } from 'ethers'

import { ConfidentialComputeRecord } from '../../src/confidential-types'
import { getEnvValSafe, fetchAbis } from '../../src/utils'

const abis = fetchAbis()

export function getInterface(name: string) {
	return new ethers.utils.Interface(abis[name])
}

export type Result<T> = [T, null] | [null, string]

export interface IBundle {
	txs: Array<string>,
	revertingHashes: Array<string>,
}

export async function createConfidentialComputeRecord(
	suaveSigner: Wallet, 
	calldata: string, 
	executionNodeAddr: string, 
	recipient: string,
	options: any = {} // todo: restrict
): Promise<ConfidentialComputeRecord> {
	const suaveNonce = await suaveSigner.getTransactionCount()
	const chainId = await suaveSigner.getChainId()
	return {
		chainId,
		nonce: suaveNonce,
		to: recipient,
		value: ethers.utils.parseEther('0'),
		gas: ethers.BigNumber.from(2000000),
		gasPrice: ethers.utils.parseUnits('20', 'gwei'),
		data: calldata, 
		executionNode: executionNodeAddr,
		...options
	}
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

export function makeSuaveSigner(useTestnet: boolean) {
	const rpcUrl = getEnvValSafe(useTestnet ? 'RIGIL_RPC' : 'SUAVE_RPC')
	const pk = getEnvValSafe(useTestnet ? 'RIGIL_PK' : 'SUAVE_PK')
	return makeSigner(rpcUrl, pk)
}

export function makeSigner(rpcUrl: string, pk: string) {
	const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
	const signer = new ethers.Wallet(pk, provider)
	return signer
}

export async function signTransactionNonRlp(signer, tx) {
	const rlpSigned = await signer.signTransaction(tx)
	return ethers.utils.parseTransaction(rlpSigned)
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

export async function submitRawTxPrettyRes(
	provider: ethers.providers.Provider, 
	inputBytes: string, 
	iface: ethers.utils.Interface, 
	label_?: string
): Promise<Result<Promise<string>>> {
	const label: string = label_ ? `'${label_}'` : ''
	return (provider as any).send('eth_sendRawTransaction', [inputBytes])
		.then(r => [handleNewSubmission(iface, provider, r, label), null])
		.catch(err => [null, handleSubmissionErr(iface, err, label)])
}

export async function handleNewSubmission(iface: any, provider: any, txHash: string, label: string): Promise<string> {
	const receipt = await provider.waitForTransaction(txHash, 1)
	let output = `\t${label} Tx ${txHash} confirmed:`
	if (receipt.status === 0) {
		output += '\t❌ Tx execution failed'
		output += `\n\t${JSON.stringify(receipt)}`
	} else {
		const tab = n => '\t  '.repeat(n)
		output += '\n\t✅ Tx execution succeeded\n'
		receipt.logs.forEach(log => {
			try {
				const parsedLog = iface.parseLog(log)
				output += `${tab(1)}${parsedLog.name}\n`
				parsedLog.eventFragment.inputs.forEach((input, i) => {
					if (parsedLog.name == 'HintEvent' && input.name == 'hint') {
						const hintTo = parsedLog.args[i].slice(0, 43)
						const hintData = '0x' + parsedLog.args[i].slice(43)
						output += `${tab(2)}${input.name}:\n${tab(3)}to: ${hintTo}\n${tab(3)}data: ${hintData}\n`
					} else {
						output += `${tab(2)}${input.name}: ${parsedLog.args[i]}\n`
					}
				})
			} catch {
				output += `${tab(1)}${log.topics[0]}\n`
				output += `${tab(2)}${log.data}\n`
			}

		})
	}

	return output + '\n'
}

export function handleSubmissionErr(iface: ethers.utils.Interface, err: any, label: string): string {
	const rpcErr = JSON.parse(err.body)?.error?.message
	if (rpcErr && rpcErr.startsWith('execution reverted: ')) {
		const revertMsg = rpcErr.slice('execution reverted: '.length)
		if (revertMsg != '0x') {
			try {
				const err = iface.parseError(revertMsg)
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
	return `\t❗️ ${label} ` + rpcErr
}

export function getRandomStr() {
	const ranInt = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
	return ranInt.toString(16)
}

export { getEnvValSafe }