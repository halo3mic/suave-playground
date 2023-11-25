import { parseHexArg, keccak256, hexFillZero } from './utils'
import { ethers, BigNumberish, Wallet } from 'ethers'


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
        if (!ccr.confidentialInputsHash || !ccr.r || !ccr.s || !ccr.v) {
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
        const rlpEncoded = ethers.utils.RLP.encode(elements).slice(2);
        const encodedWithPrefix = CONFIDENTIAL_COMPUTE_REQUEST_TYPE + rlpEncoded
            
        return encodedWithPrefix
    }

    signWithWallet(wallet: Wallet): ConfidentialComputeRequest {
        const hash = '0x' + this._hash().slice(2)
        const { recoveryParam: v, s, r } = wallet._signingKey().signDigest(hash)
        this.confidentialComputeRecord.v = parseHexArg(v)
        this.confidentialComputeRecord.r = hexFillZero(r)
        this.confidentialComputeRecord.s = hexFillZero(s)

        return this
    }

    sign(pk: string): ConfidentialComputeRequest {
        return this.signWithWallet(new Wallet(pk))
    }

    _hash(): string {
        const confidentialInputsHash = keccak256(this.confidentialInputs)
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
        const rlpEncoded = ethers.utils.RLP.encode(elements).slice(2);
        const encodedWithPrefix = CONFIDENTIAL_COMPUTE_RECORD_TYPE + rlpEncoded
        const hash = keccak256(encodedWithPrefix)

        return hash
    }

}

export interface ConfidentialComputeRecord {
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
 