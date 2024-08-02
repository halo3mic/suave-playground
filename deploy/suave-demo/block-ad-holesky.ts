import { makeDeployCallback, DeployOptions } from '../deploy-utils'
import { getEnvValSafe } from '../../tasks/utils'


const deployOptions: DeployOptions = {
	name: 'BlockAdAuctionV2', 
	contractName: 'BlockAdAuctionV2', 
	args: [ getEnvValSafe('HOLESKY_RELAY'), 'holesky' ], 
	tags: [ 'blockad-holesky' ]
}

module.exports = makeDeployCallback(deployOptions)
