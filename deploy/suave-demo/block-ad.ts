import { makeDeployCallback, DeployOptions } from '../deploy-utils'
import { getEnvValSafe } from '../../src/utils'


const deployOptions: DeployOptions = {
	name: 'BlockAdAuctionV2', 
	contractName: 'BlockAdAuctionV2', 
	args: [ getEnvValSafe('GOERLI_RELAY') ], 
	tags: [ 'blockad' ]
}

module.exports = makeDeployCallback(deployOptions)
