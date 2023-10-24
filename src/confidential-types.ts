import { ethers, BigNumberish, Wallet } from 'ethers'
import { signNoPrefix } from './crypto'
import { parseHexArg } from './utils'


const CONFIDENTIAL_COMPUTE_RECORD_TYPE = '0x42'
const CONFIDENTIAL_COMPUTE_REQUEST_TYPE = '0x43'


export class ConfidentialComputeRequest {
    confidentialComputeRecord: ConfidentialComputeRecord
    confidentialInputs: string

    constructor(confidentialComputeRecord: ConfidentialComputeRecord, confidentialInputs: string) {
        this.confidentialComputeRecord = confidentialComputeRecord
        this.confidentialInputs = confidentialInputs
    }

    rlpEncode(): string {
        const ccr = this.confidentialComputeRecord
        if (!ccr.confidentialInputsHash || !ccr.v || !ccr.r || !ccr.s) {
            throw new Error('Missing fields')
        }
        const elements = [
            [
                ccr.nonce, 
                ccr.gasPrice, 
                ccr.gas,
                ccr.to,
                ccr.value, 
                ccr.data, 
                ccr.executionNode,
                ccr.confidentialInputsHash,
                ccr.chainId,
                ccr.v, 
                ccr.r, 
                ccr.s, 
            ].map(parseHexArg),
            this.confidentialInputs,
        ]
        const rlpEncoded = CONFIDENTIAL_COMPUTE_REQUEST_TYPE + ethers.utils.RLP.encode(elements).slice(2);
        return rlpEncoded
    }

    async sign(pk: string): Promise<ConfidentialComputeRequest> {
        const hash = this._hash().slice(2)
        const { v, r, s } = signNoPrefix(hash, pk)
        this.confidentialComputeRecord.v = v
        this.confidentialComputeRecord.r = '0x' + r
        this.confidentialComputeRecord.s = '0x' + s

        return this
    }

    async signWithWallet(wallet: Wallet): Promise<ConfidentialComputeRequest> {
        return this.sign(wallet.privateKey)
    }

    _hash(): string {
        const confidentialInputsHash = ethers.utils.keccak256(this.confidentialInputs)
        this.confidentialComputeRecord.confidentialInputsHash = confidentialInputsHash
        const ccr = this.confidentialComputeRecord

        const elements = [
            ccr.executionNode, 
            confidentialInputsHash, 
            ccr.nonce, 
            ccr.gasPrice, 
            ccr.gas, 
            ccr.to,
            ccr.value,
            ccr.data,
        ].map(parseHexArg);
        const rlpEncoded = CONFIDENTIAL_COMPUTE_RECORD_TYPE + ethers.utils.RLP.encode(elements).slice(2)
        const hash = ethers.utils.keccak256(rlpEncoded)

        return hash
    }

}

interface ConfidentialComputeRecord {
    nonce: string | number,
    to: string,
    gas: BigNumberish,
    gasPrice: BigNumberish,
    value: BigNumberish,
    data: string,
    executionNode: string,
    chainId: string | number,
    confidentialInputsHash?: null | string,
    v?: null | BigNumberish,
    r?: null | BigNumberish,
    s?: null | BigNumberish,
}
 