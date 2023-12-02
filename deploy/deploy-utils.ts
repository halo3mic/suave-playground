
export interface DeployOptions {
    name: string, 
    contractName: string,
    args: Array<any>,
    tags: Array<string>,
    optionalArgs?: Map<string, any>
}

export function makeDeployCallback(deployOptions: DeployOptions): any {
	const exportEnv = _makeDeployCallback(deployOptions)
	exportEnv.tags = deployOptions.tags
	return exportEnv
}

function _makeDeployCallback(deployOptions: DeployOptions): any {
	return async ({ getNamedAccounts, deployments }) => {
		const { deploy, log } = deployments
		const { deployer } = await getNamedAccounts()

		log(deployOptions.name)
		const deployResult = await deploy(deployOptions.name, {
			from: deployer,
			contract: deployOptions.contractName,
			args: deployOptions.args,
			gas: 1.5e5,
			skipIfAlreadyDeployed: false, 
			...deployOptions.optionalArgs
		})

		if (deployResult.newlyDeployed) {
			log(`- ${deployResult.contractName} deployed at ${deployResult.address} using ${deployResult.receipt.gasUsed} gas`)
		} else {
			log(`- Deployment skipped, using previous deployment at: ${deployResult.address}`)
		}
	}
}