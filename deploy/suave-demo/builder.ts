import { makeDeployCallback, DeployOptions } from '../deploy-utils'
import { getEnvValSafe } from '../../utils'


const deployOptions: DeployOptions = {
    name: 'Builder', 
    contractName: 'EthBlockBidSenderContract', 
    args: [ getEnvValSafe('GOERLI_RELAY_URL') ], 
    tags: [ 'builder' ]
};

module.exports = makeDeployCallback(deployOptions)
