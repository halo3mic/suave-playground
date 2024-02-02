import { SuaveProvider, SuaveWallet, SuaveContract } from 'ethers-suave'


describe('oracle', async () => {


    it.only('test-run', async () => {
        const executionNodeUrl = 'http://localhost:8545'
        const executionNodeAddress = '0x7d83e42B214b75bf1f3e57Adc3415Da573D97BFF'
        const pk = '1111111111111111111111111111111111111111111111111111111111111111'
        const oracleContractAdd = '0x9c4432284dcB444Ab4Deb422f18646379b7F8e9D'
        const abi = require('../abi/contracts/oracle/BinanceOracle.sol/BinanceOracle.json')

        // todo: deploy each time

        const provider = new SuaveProvider(executionNodeUrl, executionNodeAddress)
        const wallet = new SuaveWallet(pk, provider)

        const OracleContract = new SuaveContract(oracleContractAdd, abi, wallet)

        const ticker = 'BTCUSDT'
        const res = await OracleContract.queryLatestPrice.sendConfidentialRequest(ticker)
        console.log(res)

        // 0x75fff4670000000000000000000000000000000000000000000000000000000043200002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000166661696c656420746f206465636f646520696e70757400000000000000000000

    })



})