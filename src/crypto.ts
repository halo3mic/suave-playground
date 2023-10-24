import { ec } from 'elliptic';


const EC = new ec('secp256k1');

interface Sig {
    r: string,
    s: string,
    v: number,
}

export function signNoPrefix(msgHash: string, privateKey: string): Sig {
    const key = EC.keyFromPrivate(privateKey, 'hex');
    const signature = key.sign(msgHash);

    const r = signature.r.toString(16);
    const s = signature.s.toString(16);
    const v = signature.recoveryParam;

    return { r, s, v }
}
