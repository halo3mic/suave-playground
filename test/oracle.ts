import { SuaveProvider, SuaveWallet, SuaveContract } from 'ethers-suave'
import { ethers } from 'hardhat'
import { expect } from 'chai'
import * as utils from '../tasks/utils'


describe('oracle', async () => {
    const executionNodeUrl = utils.getEnvValSafe('SUAVE_RPC')
    const goerliUrl = utils.getEnvValSafe('GOERLI_RPC')
    const executionNodeAddress = utils.getEnvValSafe('EXECUTION_NODE')
    const suaveChainPK = utils.getEnvValSafe('SUAVE_PK')
    const goerliPK = utils.getEnvValSafe('GOERLI_PK')
    let OracleContract

    before(async () => {
        const provider = new ethers.providers.JsonRpcProvider(executionNodeUrl)
        const signer = new ethers.Wallet(suaveChainPK, provider)

        let oracleContract;
        await ethers.getContractFactory('BinanceOracle')
            .then(async (factory) => {
                oracleContract = await factory.connect(signer).deploy()
                await oracleContract.deployTransaction.wait()
            })
            .catch((err) => {
                console.log(err)
            })

        const suaveProvider = new SuaveProvider(executionNodeUrl, executionNodeAddress)
        const suaveSigner = new SuaveWallet(suaveChainPK, suaveProvider)
        OracleContract = new SuaveContract(
            oracleContract.address, 
            oracleContract.interface,
            suaveSigner
        )
    })

    it('recover address', async () => {
        const pk = '1111111111111111111111111111111111111111111111111111111111111111'
        const targetAddress = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A'.toLowerCase()

        const res = await OracleContract.getAddressForPk.sendConfidentialRequest(pk)
        const recAddress = '0x' + res.confidentialComputeResult.slice(26)
        expect(recAddress).to.equal(targetAddress)
    })

    it('queryLatestPrice', async () => {
        const ticker = 'BTCUSDT'
        const res = await OracleContract.queryLatestPrice.sendConfidentialRequest(ticker)
        const resPrice = parseInt(res.confidentialComputeResult, 16)
        expect(resPrice).to.be.greaterThan(0)
        expect(resPrice).to.be.lessThan(70_000*10**4) // ikr so pessimistic
    })

    it('sendRawTransaction', async () => {
        const goerliProvider = new ethers.providers.JsonRpcProvider(goerliUrl)
        const goerliSigner = new ethers.Wallet(goerliPK, goerliProvider)
        const signedTx = await goerliSigner.signTransaction({
            to: goerliSigner.address,
            data: ethers.utils.toUtf8Bytes('hello'),
            gasLimit: 60000,
            gasPrice: ethers.utils.parseUnits('80', 'gwei'),
            nonce: await goerliSigner.getTransactionCount()
        })
        const res = await OracleContract.sendRawTx.sendConfidentialRequest(signedTx)
        console.log(res.confidentialComputeResult)
    })

    it('queryAndSubmit', async () => {
        const ticker = 'ETHUSDT'
        const privateSubmission = true
        const goerliProvider = new ethers.providers.JsonRpcProvider(goerliUrl)
        const goerliSigner = new ethers.Wallet(goerliPK, goerliProvider)
        
        // Deploy oracle settlement contract
        const settlementContract = await ethers.getContractFactory('OracleSettlementContract')
            .then(async (factory) => {
                const contract = await factory.connect(goerliSigner).deploy()
                const r = await contract.deployTransaction.wait()
                expect(r.status).to.equal(1)
                return contract
            })
            .catch((err) => {
                throw new Error(err)
            })

        console.log("Settlement contract: ", settlementContract.address)

        // Init the contract
        const initRes = await OracleContract.confidentialConstructor
            .sendConfidentialRequest({})
        const receipt = await initRes.wait()
        if (receipt.status == 0)
            throw new Error('ConfidentialInit callback failed')
        const controllerAddress = await OracleContract.controller()

        // Send gas to the controller
        const payReceipt = await goerliSigner.sendTransaction({
            to: controllerAddress,
            value: ethers.utils.parseEther('0.02')
        }).then(tx => tx.wait())
        expect(payReceipt.status).to.equal(1)

        // Register
        const registerRes = await OracleContract.registerSettlementContract
            .sendConfidentialRequest(settlementContract.address)
        const registerReceipt = await registerRes.wait()
        if (registerReceipt.status == 0)
            throw new Error('ConfidentialInit callback failed')
        
        while (true) {
            const nonce = await goerliProvider.getTransactionCount(controllerAddress)
            if (nonce == 1) {
                break
            }
            await sleep(2000)
        }

        // Submit oracle updates for the next N blocks
        const controllerNonce = 1
        const gasPrice = '0x174876e800'
        for (let i=0; i<100; i++) {
            const nextGoerliBlock = (await goerliProvider.getBlockNumber()) + 1
            console.log(`${i} | Submitting for Goerli block: ${nextGoerliBlock}`)
            const newControllerNonce = await goerliProvider.getTransactionCount(controllerAddress)
            // Exit if the settlement tx landed (signer's nonce changed)
            if (newControllerNonce == 2) {
                return
            }

            try {
                const submissionRes = await OracleContract.queryAndSubmit.sendConfidentialRequest(
                    ticker,
                    controllerNonce,
                    gasPrice,
                    nextGoerliBlock, 
                    privateSubmission
                )
                const receipt = await submissionRes.wait()
                expect(receipt.status).to.equal(1)
            } catch (err) {
                console.log(err)
            }
            await sleep(10_000)
        }
        throw new Error('efforts were to no avail')
    }).timeout(1e6)

})

async function sleep(ms) {
    new Promise(resolve => setTimeout(resolve, ms))
}