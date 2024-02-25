import { makeDeployCallback, DeployOptions } from '../deploy-utils'

const deployOptions: DeployOptions = {
	name: 'OracleSettlementContract', 
	contractName: 'OracleSettlementContract', 
	args: [], 
	tags: [ 'oracle-settlement' ]
}

module.exports = makeDeployCallback(deployOptions)
