import { makeDeployCallback, DeployOptions } from '../deploy-utils'
import { getEnvValSafe } from '../../tasks/utils'


const deployOptions: DeployOptions = {
	name: 'Builder', 
	contractName: 'EthBlockBidSenderContract', 
	args: [ getEnvValSafe('HOLESKY_RELAY') ], 
	tags: [ 'builder' ]
}

module.exports = makeDeployCallback(deployOptions)
