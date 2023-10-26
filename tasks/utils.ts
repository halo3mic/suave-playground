import { HardhatRuntimeEnvironment as HRE } from 'hardhat/types';
import { ethers } from 'ethers';

import { getEnvValSafe, parseHexArg } from '../src/utils';


export interface IBundle {
	txs: Array<any>,
	revertingHashes: Array<string>,
}

// suit geth naming convention
export function parseTx(tx) {
	let parsedTx = {}
	for (let [ key, val ] of Object.entries(tx)) {
		if (['from', 'chainId'].includes(key))
			continue;

		switch (key) {
			case 'gasLimit':
				key = 'gas'
				break;
			case 'data': 
				key = 'input'
				break;
			case 'd':
				key = 'maxFeePerGas'
				break;
			default: 
				break; 
		}
		parsedTx[key] = removeLeadingZeros(parseHexArg(val as any))
	}

	parsedTx['maxPriorityFeePerGas'] = parsedTx['maxPriorityFeePerGas'] || null
	parsedTx['maxFeePerGas'] = parsedTx['maxFeePerGas'] || null
	if (parsedTx['type'] == '0x') {
		parsedTx['type'] = '0x0'
	}
	
	return parsedTx;
}

export function txToBundle(signedTx): IBundle {
	return {
	  txs: [signedTx],
	  revertingHashes: [],
	};
}

export function makeConfidentialDataBytesFromBundle(bundle: IBundle): string {
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

export function checkChain(hre: HRE, desiredChain: number) {
	const chainId = hre.network.config.chainId
	if (chainId != desiredChain) {
		throw Error(`Expected Suave chain-id(${desiredChain}), got ${chainId}`)
	}
}

export { getEnvValSafe };