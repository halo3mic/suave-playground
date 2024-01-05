import { makeDeployCallback, DeployOptions } from '../deploy-utils'


const deployOptions: DeployOptions = {
	name: 'MevShare', 
	contractName: 'MevShareContract', 
	args: [], 
	tags: [ 'mevshare' ]
}

module.exports = makeDeployCallback(deployOptions)
