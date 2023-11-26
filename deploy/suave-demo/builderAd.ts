import { makeDeployCallback, DeployOptions } from '../deploy-utils'
import { getEnvValSafe } from '../../src/utils'


const deployOptions: DeployOptions = {
    name: 'BlockAdAuction', 
    contractName: 'BlockAdAuction', 
    args: [ getEnvValSafe('GOERLI_RELAY') ], 
    tags: [ 'blockad' ]
};

module.exports = makeDeployCallback(deployOptions)
