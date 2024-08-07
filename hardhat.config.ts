
import {config as dconfig} from 'dotenv'
import '@nomiclabs/hardhat-waffle'
import 'hardhat-deploy-ethers'
import 'hardhat-abi-exporter'
import 'hardhat-deploy'

import { getEnvValSafe } from './tasks/utils'
import './tasks/oracle-updates'
import './tasks/build-blocks'
import './tasks/mevshare'
import './tasks/adblock'


dconfig()
const SUAVE_PK = getEnvValSafe('SUAVE_PK')
const HOLESKY_PK = getEnvValSafe('HOLESKY_PK')
const RIGIL_PK = getEnvValSafe('RIGIL_PK')
const SUAVE_RPC = getEnvValSafe('SUAVE_RPC')
const HOLESKY_RPC = getEnvValSafe('HOLESKY_RPC')
const RIGIL_RPC = getEnvValSafe('RIGIL_RPC')
const TOLIMAN_RPC = getEnvValSafe('TOLIMAN_RPC')
const TOLIMAN_PK = getEnvValSafe('TOLIMAN_PK')


export default {
	solidity: '0.8.13',
	defaultNetwork: 'suave',
	namedAccounts: {
		deployer: {
			default: 0,
		}
	},
	networks: {
		holesky: {
			chainId: 17000,
			url: HOLESKY_RPC,
			accounts: [ HOLESKY_PK ],
		}, 
		suave: {
			chainId: 424242,
			gasPrice: 0,
			url: SUAVE_RPC,
			accounts: [ SUAVE_PK ],
			companionNetworks: {
				holesky: 'holesky',
			},
		},
		rigil: {
			chainId: 16813125,
			url: RIGIL_RPC,
			accounts: [ RIGIL_PK ],
			companionNetworks: {
				holesky: 'holesky',
			},
		}, 
		toliman: {
			chainId: 33626250, 
			url: TOLIMAN_RPC,
			accounts: [ TOLIMAN_PK ], 
			companionNetworks: {
				holesky: 'holesky',
			},
		}
	}
}
