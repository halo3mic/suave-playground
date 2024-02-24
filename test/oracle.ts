import { SuaveProvider, SuaveWallet, SuaveContract } from 'ethers-suave'
import { ethers } from 'hardhat'
import { expect } from 'chai'
import * as utils from '../tasks/utils'


describe('oracle', async () => {
    const executionNodeUrl = utils.getEnvValSafe('SUAVE_RPC')
    const goerliUrl = utils.getEnvValSafe('GOERLI_RPC')
    const executionNodeAddress = utils.getEnvValSafe('EXECUTION_NODE')
    const suaveChainPK = utils.getEnvValSafe('SUAVE_PK')
    const goerliPK = utils.getEnvValSafe('G2_PK')
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

    it('queryLatestPrice', async () => {
        const ticker = 'BTCUSDT'
        const res = await OracleContract.queryLatestPrice.sendConfidentialRequest(ticker)
        const resPrice = parseInt(res.confidentialComputeResult, 16)
        expect(resPrice).to.be.greaterThan(0)
        expect(resPrice).to.be.lessThan(70_000*10^4) // ikr so pessimistic
    })

    it('queryAndSubmit', async () => {
        const goerliProvider = new ethers.providers.JsonRpcProvider(goerliUrl)        
        const controllerGoerliAddress = new ethers.Wallet(goerliPK, goerliProvider).address
        const pkBytes = ethers.utils.toUtf8Bytes(goerliPK)

        const initRes = await OracleContract.confidentialConstructor
            .sendConfidentialRequest({ confidentialInputs: pkBytes })
        const receipt = await initRes.wait()
        if (receipt.status == 0)
            throw new Error('ConfidentialInit callback failed')

        let controllerNonce
        for (let i=0; i<10; i++) {
            const nextGoerliBlock = (await goerliProvider.getBlockNumber()) + 1
            const _controllerNonce = await goerliProvider.getTransactionCount(controllerGoerliAddress)
            if (controllerNonce && _controllerNonce !== controllerNonce) {
                return
            }
            controllerNonce = _controllerNonce
            console.log(`Submitting for Goerli block: ${nextGoerliBlock}`)

            const ticker = 'ETHUSDT'
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