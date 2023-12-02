import { makeDeployCallback, DeployOptions } from '../deploy-utils'


const deployOptions: DeployOptions = {
	name: 'MevShare', 
	contractName: 'MevShareBidContract', 
	args: [], 
	tags: [ 'mevshare' ]
}

module.exports = makeDeployCallback(deployOptions)
