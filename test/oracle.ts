import { SuaveProvider, SuaveWallet, SuaveContract } from 'ethers-suave'
import { expect } from 'chai'
import { ethers } from 'hardhat'


describe('oracle', async () => {


    const executionNodeUrl = 'http://localhost:8545'
    const executionNodeAddress = '0x7d83e42B214b75bf1f3e57Adc3415Da573D97BFF'
    const pk = '1111111111111111111111111111111111111111111111111111111111111111'
    var oracleContract

    before(async () => {
        const suaveProvider = new ethers.providers.JsonRpcProvider(executionNodeUrl)
        const suaveSigner = new ethers.Wallet(pk, suaveProvider)
        await ethers.getContractFactory('BinanceOracle')
            .then(async (factory) => {
                oracleContract = await factory.connect(suaveSigner).deploy()
                await oracleContract.deployTransaction.wait()
            })
            .catch((err) => {
                console.log(err)
            })        
    })


    it('fetch-price', async () => {
        const provider = new SuaveProvider(executionNodeUrl, executionNodeAddress)
        const wallet = new SuaveWallet(pk, provider)

        const OracleContract = new SuaveContract(oracleContract.address, oracleContract.interface, wallet)

        const ticker = 'BTCUSDT'
        console.log('queryLatestPrice')
        const res = await OracleContract.queryLatestPrice.sendConfidentialRequest(ticker)
        console.log(res)
    })


    it('createTransaction', async () => {
        const goerliProvider = new ethers.providers.JsonRpcProvider('http://localhost:8548')


        const provider = new SuaveProvider(executionNodeUrl, executionNodeAddress)
        const wallet = new SuaveWallet(pk, provider)

        const OracleContract = new SuaveContract(oracleContract.address, oracleContract.interface, wallet)

        while (true) {
            const nextGoerliBlock = (await goerliProvider.getBlockNumber()) + 1
            console.log(nextGoerliBlock)
            const price = 50010334910
            const nonce = 2
            try {
                const res = await OracleContract.createTransaction.sendConfidentialRequest(price, nonce, nextGoerliBlock)
                console.log(res)
            } catch (err) {
                console.log(err)
            }
            await new Promise(resolve => setTimeout(resolve, 10000))
        }
    }).timeout(1e6)

    it.only('queryAndSubmit', async () => {
        const goerliProvider = new ethers.providers.JsonRpcProvider('http://localhost:8548')


        const provider = new SuaveProvider(executionNodeUrl, executionNodeAddress)
        const wallet = new SuaveWallet(pk, provider)

        const OracleContract = new SuaveContract(oracleContract.address, oracleContract.interface, wallet)

        while (true) {
            const nextGoerliBlock = (await goerliProvider.getBlockNumber()) + 1
            console.log(nextGoerliBlock)
            const ticker = 'ETHUSDT'
            const nonce = 3
            try {
                const res = await OracleContract.queryAndSubmit.sendConfidentialRequest(
                    ticker,
                    nonce, 
                    nextGoerliBlock
                )
                console.log(res)
            } catch (err) {
                console.log(err)
            }
            await new Promise(resolve => setTimeout(resolve, 10000))
        }
    }).timeout(1e6)



})