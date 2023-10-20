require('dotenv').config();
require("@nomiclabs/hardhat-waffle");
require('hardhat-deploy-ethers');
require('hardhat-abi-exporter');
require("hardhat-tracer");
require('hardhat-deploy');


const { getEnvValSafe } = require('./utils')

// Tasks
require('./tasks/send-bundles')


const SUAVE_PK = getEnvValSafe("SUAVE_PK");
const GOERLI_PK = getEnvValSafe("GOERLI_PK");
const SUAVE_RPC = getEnvValSafe("SUAVE_RPC");
const GOERLI_RPC = getEnvValSafe("GOERLI_RPC");

module.exports = {
  solidity: "0.8.8",
  namedAccounts: {
    deployer: {
      default: 0,
    }
  },
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      chainId: 424242,
      forking: {
        url: SUAVE_RPC, 
      },
      accounts: {
        accountsBalance: "10000000000000000000000000", 
        count: 100
      }
    }, 
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
};
