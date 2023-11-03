
import { config as dconfig } from 'dotenv'
import '@nomiclabs/hardhat-waffle'
import 'hardhat-deploy-ethers'
import 'hardhat-abi-exporter'
import 'hardhat-tracer'
import 'hardhat-deploy'

import { getEnvValSafe } from './src/utils'
import './tasks/send-bundles'
import './tasks/build-blocks'
import './tasks/submit-and-build'


dconfig()
const SUAVE_PK = getEnvValSafe("SUAVE_PK");
const GOERLI_PK = getEnvValSafe("GOERLI_PK");
const SUAVE_RPC = getEnvValSafe("SUAVE_RPC");
const GOERLI_RPC = getEnvValSafe("GOERLI_RPC");


export default {
  solidity: "0.8.8",
  defaultNetwork: 'suave',
  namedAccounts: {
    deployer: {
      default: 0,
    }
  },
  networks: {
    suave: {
      chainId: 424242,
      gasPrice: 0,
      url: SUAVE_RPC,
      accounts: [ SUAVE_PK ]
    },
    goerli: {
      chainId: 5,
      url: GOERLI_RPC,
      accounts: [ GOERLI_PK ]
    }
  }
}
