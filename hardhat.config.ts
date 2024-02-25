
import { config as dconfig } from 'dotenv'
import '@nomiclabs/hardhat-waffle'
import 'hardhat-deploy-ethers'
import 'hardhat-abi-exporter'
import 'hardhat-tracer'
import 'hardhat-deploy'

import { getEnvValSafe } from './src/utils'
import './tasks/oracle-updates'
import './tasks/build-blocks'
import './tasks/mevshare'
import './tasks/adblock'


dconfig()
const SUAVE_PK = getEnvValSafe('SUAVE_PK')
const GOERLI_PK = getEnvValSafe('GOERLI_PK')
const RIGIL_PK = getEnvValSafe('RIGIL_PK')
const SUAVE_RPC = getEnvValSafe('SUAVE_RPC')
const GOERLI_RPC = getEnvValSafe('GOERLI_RPC')
const RIGIL_RPC = getEnvValSafe('RIGIL_RPC')


export default {
	solidity: '0.8.13',
	defaultNetwork: 'suave',
	namedAccounts: {
		deployer: {
			default: 0,
		}
	},
	networks: {
		goerli: {
			chainId: 5,
			url: GOERLI_RPC,
			accounts: [ GOERLI_PK ],
		}, 
		suave: {
			chainId: 424242,
			gasPrice: 0,
			url: SUAVE_RPC,
			accounts: [ SUAVE_PK ],
			companionNetworks: {
				goerli: 'goerli',
			},
		},
		rigil: {
			chainId: 16813125,
			url: RIGIL_RPC,
			accounts: [ RIGIL_PK ],
			companionNetworks: {
				goerli: 'goerli',
			},
		}
	}
}
