import { makeDeployCallback, DeployOptions } from '../deploy-utils'
import { getEnvValSafe } from '../../src/utils'


const deployOptions: DeployOptions = {
    name: 'BlockAdAuction', 
    contractName: 'BlockAdAuction', 
    args: [ getEnvValSafe('GOERLI_RELAY') ], 
    tags: [ 'adbuilder' ]
};

module.exports = makeDeployCallback(deployOptions)
