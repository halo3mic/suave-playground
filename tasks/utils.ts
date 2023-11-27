import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types';
import { ethers, Wallet, BigNumber } from 'ethers';

import { ConfidentialComputeRecord } from '../src/confidential-types';
import { getEnvValSafe, parseHexArg, fetchAbis } from '../src/utils';

const abis = fetchAbis()

export function getInterface(name: string) {
	return new ethers.utils.Interface(abis[name])
}

export type Result<T> = [T, null] | [null, string]

export interface IBundle {
	txs: Array<string>,
	revertingHashes: Array<string>,
}

// todo: check for unused utils

// // suit geth naming convention
// export function parseTx(tx) {
// 	let parsedTx = {}
// 	for (let [ key, val ] of Object.entries(tx)) {
// 		if (['from', 'chainId'].includes(key))
// 			continue;

// 		switch (key) {
// 			case 'gasLimit':
// 				key = 'gas'
// 				break;
// 			case 'data': 
// 				key = 'input'
// 				break;
// 			case 'd':
// 				key = 'maxFeePerGas'
// 				break;
// 			default: 
// 				break; 
// 		}
// 		parsedTx[key] = removeLeadingZeros(parseHexArg(val as any))
// 	}

// 	parsedTx['maxPriorityFeePerGas'] = parsedTx['maxPriorityFeePerGas'] || null
// 	parsedTx['maxFeePerGas'] = parsedTx['maxFeePerGas'] || null
// 	if (parsedTx['type'] == '0x') {
// 		parsedTx['type'] = '0x0'
// 	}
	
// 	return parsedTx;
// }

export async function createConfidentialComputeRecord(
	suaveSigner: Wallet, 
	calldata: string, 
	executionNodeAddr: string, 
	recipient: string,
	options: any = {} // todo: restrict
): Promise<ConfidentialComputeRecord> {
	const suaveNonce = await suaveSigner.getTransactionCount();
	const chainId = await suaveSigner.getChainId();
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
	};
}

export async function makePaymentBundleBytes(signer: Wallet, reward: BigNumber): Promise<string> {
	return makeSimplePaymentTx(signer, reward).then(txToBundleBytes)
}

export async function makeSimplePaymentTx(signer: Wallet, reward: BigNumber): Promise<string> {
	const expectedGas = 21000
	const expectedBaseFee = await getNextBaseFee(signer.provider)
	const gasPrice = reward.div(expectedGas).add(expectedBaseFee)
	const nonce = await signer.getTransactionCount();
	const chainId = await signer.getChainId();
	const tx = {
		nonce,
		from: signer.address,
		to: signer.address,
		gasPrice,
		gasLimit: expectedGas,
		chainId,
	};
	const signedTx = await signer.signTransaction(tx);
	return signedTx
}

export function txToBundleBytes(signedTx): string {
	const bundle = txToBundle(signedTx);
	const bundleBytes = bundleToBytes(bundle);
	return bundleBytes;
}

export function txToBundle(signedTx): IBundle {
	return {
	  txs: [signedTx],
	  revertingHashes: [],
	};
}

export function bundleToBytes(bundle: IBundle): string {
	const bundleBytes = Buffer.from(JSON.stringify(bundle), 'utf8')
	const confidentialDataBytes = ethers.utils.defaultAbiCoder.encode(['bytes'], [bundleBytes])
	return confidentialDataBytes
}

export function removeLeadingZeros(hex: string): string {
	return '0x' + hex.slice(2).replace(/^0+/, '');
}

export function makeGoerliSigner() {
	return makeSigner(getEnvValSafe('GOERLI_RPC'), getEnvValSafe('GOERLI_PK'));
}

export function makeSuaveSigner() {
	return makeSigner(getEnvValSafe('SUAVE_RPC'), getEnvValSafe('SUAVE_PK'));
}

export function makeSigner(rpcUrl: string, pk: string) {
	const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
	const signer = new ethers.Wallet(pk, provider);
	return signer
}

export async function signTransactionNonRlp(signer, tx) {
	const rlpSigned = await signer.signTransaction(tx);
	return ethers.utils.parseTransaction(rlpSigned);
}

export async function fetchDeployedContract(hre: HRE, deploymentName: string) {
	return (hre.ethers as any).getContract(deploymentName) 
}

export function checkChain(hre: HRE, desiredChain: number) {
	const chainId = hre.network.config.chainId
	if (chainId != desiredChain) {
		throw Error(`Expected Suave chain-id(${desiredChain}), got ${chainId}`)
	}
}

export function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getNextBaseFee(provider: ethers.providers.Provider) {
    return provider.getBlock('pending').then(b => b.baseFeePerGas)
}

export async function submitRawTxPrettyRes(
	provider: ethers.providers.Provider, 
	inputBytes: string, 
	iface: ethers.utils.Interface, 
	label?: string
): Promise<Result<Promise<string>>> {
	label = label ? `'${label}'` : ''
	return (provider as any).send('eth_sendRawTransaction', [inputBytes])
		.then(r => [handleNewSubmission(iface, provider, r, label), null])
		.catch(err => [null, handleSubmissionErr(iface, err, label)])
}

export async function handleNewSubmission(iface: any, provider: any, txHash: string, label: string): Promise<string> {
	const receipt = await provider.waitForTransaction(txHash, 1)
	let output = `\t${label} Tx ${txHash} confirmed:`
	if (receipt.status === 0) {
		output += `\t❌ Tx execution failed`
		output += `\n\t${JSON.stringify(receipt)}`
	} else {
		const tab = n => '\t  '.repeat(n)
		output += `\n\t✅ Tx execution succeeded\n`
		receipt.logs.forEach(log => {
			try {
				const parsedLog = iface.parseLog(log);
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

export function handleSubmissionErr(iface: any, err: any, label: string): string {
	const rpcErr = JSON.parse(err.body)?.error?.message
	if (rpcErr && rpcErr.startsWith('execution reverted: ')) {
		const revertMsg = rpcErr.slice('execution reverted: '.length)
		if (revertMsg != '0x') {
			const decodedErr = iface.decodeErrorResult(revertMsg.slice(0, 10), revertMsg)
			// todo: find err from interface obj
			switch (revertMsg.slice(0, 10)) {
				case '0x75fff467':
					const errStr = Buffer.from(decodedErr[1].slice(2), 'hex').toString()
					return `\t❗️ ${label} PeekerReverted(${decodedErr[0]}, '${errStr})'`
				case '0x9433d94b':
					return `\t❗️ ${label} BlockAdAuctionError('${decodedErr[0]}')`
				default:
					return `\t❗️ ${label} ` + rpcErr + '\n Params: ' + decodedErr.join(',')
			}
		}
	}
	return `\t❗️ ${label} ` + rpcErr
}

export function getRandomStr() {
	const ranInt = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
	return ranInt.toString(16);
}

export { getEnvValSafe };