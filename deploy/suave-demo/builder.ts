import { makeDeployCallback, DeployOptions } from '../deploy-utils'
import { getEnvValSafe } from '../../src/utils'


const deployOptions: DeployOptions = {
    name: 'Builder', 
    contractName: 'EthBlockBidSenderContract', 
    args: [ getEnvValSafe('GOERLI_RELAY') ], 
    tags: [ 'builder' ]
};

module.exports = makeDeployCallback(deployOptions)
