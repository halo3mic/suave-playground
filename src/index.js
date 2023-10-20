// import { providers, Wallet, utils } from "ethers";
// import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
// import * as dotenv from "dotenv";
// import fetch from "node-fetch";

// const { id: ethersId } = utils;


// function configFromEnv() {
//     dotenv.config()

//     const GoerliRpcUrl = process.env.GOERLI_RPC_URL
//     const GoerliPK = process.env.GOERLI_PK

//     if (!GoerliRpcUrl || !GoerliPK) {
//         throw new Error("Missing GoerliRpcUrl or GoerliPK")
//     }

//     return { GoerliRpcUrl, GoerliPK }
// }

// async function makeBundle(flashbotsProvider, wallet) {
//     const transaction = {
//         to: wallet.address, 
//         data: '0x' + Buffer.from("🍃 says hello").toString('hex')
//     }
//     const transactionBundle = [
//         {
//             signer: wallet,
//             transaction: transaction
//         }
//     ]
//     const signedTxs = await flashbotsProvider.signBundle(transactionBundle)
//     return signedTxs
// }

// async function sendBundle() {
//     const { GoerliRpcUrl, GoerliPK } = configFromEnv()
//     console.log(GoerliRpcUrl, GoerliPK)

//     const provider = new providers.JsonRpcProvider(GoerliRpcUrl)
//     const wallet = new Wallet(GoerliPK, provider)
//     const transaction = {
//         to: wallet.address, 
//         data: '0x' + Buffer.from("🍃 says hello").toString('hex')
//     }
//     const signedTx = await wallet.signTransaction(transaction)

//     const body = {
//         params: {txs: [signedTx]},
//         method: 'eth_callBundle',
//         id: 69,
//         jsonrpc: "2.0"
//     }
//     const signature = `${wallet.address}:${await wallet.signMessage(ethersId(JSON.stringify(body)))}`
//     const headers = {
//         'Content-Type': 'application/json',
//         'X-Flashbots-Signature': signature,
//     }
    
//     const resp = await fetch('https://relay-goerli.flashbots.net', {
//         method: 'POST',
//         body: JSON.stringify({
//             jsonrpc: '2.0',
//             method: 'eth_callBundle',
//             params: [{txs: [signedTx]}],
//             id: 1
//         }),
//         headers: headers
//     })

//     const respJson = await resp.json()
//     console.log(respJson)
// }


// async function main() {
//     const { GoerliRpcUrl, GoerliPK } = configFromEnv()
//     console.log(GoerliRpcUrl, GoerliPK)

//     const provider = new providers.JsonRpcProvider(GoerliRpcUrl)
//     const wallet = new Wallet(GoerliPK, provider)
//     const flashbotsProvider = await FlashbotsBundleProvider.create(provider, wallet)
//     const signedBundle = await makeBundle(flashbotsProvider, wallet)

//     console.log(signedBundle)

//     const simulation = await flashbotsProvider.simulate(signedBundle)
//         .catch((error) => {
//             console.log(error)
//         })
//     console.log(simulation)
// }

// sendBundle()
