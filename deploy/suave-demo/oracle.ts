import { makeDeployCallback, DeployOptions } from '../deploy-utils'


const deployOptions: DeployOptions = {
	name: 'BinanceOracle', 
	contractName: 'BinanceOracle', 
	args: [ ], 
	tags: [ 'oracle' ]
}

module.exports = makeDeployCallback(deployOptions)
