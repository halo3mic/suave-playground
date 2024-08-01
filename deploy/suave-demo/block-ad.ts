import { makeDeployCallback, DeployOptions } from '../deploy-utils'
import { getEnvValSafe } from '../../tasks/utils'


const deployOptions: DeployOptions = {
	name: 'BlockAdAuctionV2', 
	contractName: 'BlockAdAuctionV2', 
	args: [ getEnvValSafe('HOLESKY_RELAY') ], 
	tags: [ 'blockad' ]
}

module.exports = makeDeployCallback(deployOptions)
