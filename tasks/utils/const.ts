

export const SUAVE_CHAIN_ID = 424242 // TODO: USER DEFINED
export const HOLESKY_CHAIN_ID = 17000
export const RIGIL_CHAIN_ID = 16813125
export const TOLIMAN_CHAIN_ID = 33626250

export const supportedSuaveChains = [
	SUAVE_CHAIN_ID,
	RIGIL_CHAIN_ID,
	TOLIMAN_CHAIN_ID
]

export const precompiles = {
	isConfidentialAddr: '0x0000000000000000000000000000000042010000',
	buildEthBlock: '0x0000000000000000000000000000000042100001',
	confidentialInputs: '0x0000000000000000000000000000000042010001',
	confidentialStoreRetrieve: '0x0000000000000000000000000000000042020001',
	confidentialStoreStore: '0x0000000000000000000000000000000042020000',
	ethCall: '0x0000000000000000000000000000000042100003',
	extractHint: '0x0000000000000000000000000000000042100037',
	fetchBids: '0x0000000000000000000000000000000042030001',
	fillMevShareBundle: '0x0000000000000000000000000000000043200001',
	newBid: '0x0000000000000000000000000000000042030000',
	signEthTransaction: '0x0000000000000000000000000000000040100001',
	simulateBundle: '0x0000000000000000000000000000000042100000',
	submitBundleJsonRpc: '0x0000000000000000000000000000000043000001',
	submitEthBlockBidToRelay: '0x0000000000000000000000000000000042100002'
}
