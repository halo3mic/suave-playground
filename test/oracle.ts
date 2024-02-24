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

    it.only('queryAndSubmit', async () => {
        const ticker = 'ETHUSDT'
        const goerliProvider = new ethers.providers.JsonRpcProvider(goerliUrl)   

        // Init the contract
        const initRes = await OracleContract.confidentialConstructor.sendConfidentialRequest({})
        const receipt = await initRes.wait()
        if (receipt.status == 0)
            throw new Error('ConfidentialInit callback failed')
        const controllerAddress = await OracleContract.controller()

        // Send gas to the controller
        const goerliSigner = new ethers.Wallet(goerliPK, goerliProvider)
        const payReceipt = await goerliSigner.sendTransaction({
            to: controllerAddress,
            value: ethers.utils.parseEther('0.01')
        }).then(tx => tx.wait())
        expect(payReceipt.status).to.equal(1)
        console.log(controllerAddress)

        // Submit oracle updates for the next N blocks
        let controllerNonce = 0
        for (let i=0; i<20; i++) {
            const nextGoerliBlock = (await goerliProvider.getBlockNumber()) + 1
            console.log(`${i} | Submitting for Goerli block: ${nextGoerliBlock}`)
            // Obtain the present nonce on the settlement layer
            const newControllerNonce = await goerliProvider.getTransactionCount(controllerAddress)
            // Exit if the settlement tx landed (signer's nonce changed)
            
            console.log(newControllerNonce, controllerNonce, newControllerNonce)
            if (newControllerNonce !== controllerNonce) {
                return
            }

            try {
                const submissionRes = await OracleContract.queryAndSubmit.sendConfidentialRequest(
                    ticker,
                    controllerNonce,
                    nextGoerliBlock
                )
                const receipt = await submissionRes.wait()
                expect(receipt.status).to.equal(1)
            } catch (err) {
                console.log(err)
            }
            await new Promise(resolve => setTimeout(resolve, 10_000))
        }
        throw new Error('efforts were to no avail')
    }).timeout(1e6)

})