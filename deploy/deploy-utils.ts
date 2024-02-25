
export interface DeployOptions {
    name: string, 
    contractName: string,
    args: Array<any>,
    tags: Array<string>,
    optionalArgs?: Record<string, any>
}

export function makeDeployCallback(
	deployOptions: DeployOptions, 
	preDeployCallback?: any,
	postDeployCallback?: any
): any {
	const exportEnv = _makeDeployCallback(
		deployOptions,
		preDeployCallback,
		postDeployCallback
	)
	exportEnv.tags = deployOptions.tags
	return exportEnv
}

function _makeDeployCallback(
	deployOptions: DeployOptions, 
	preDeployCallback?: any,
	postDeployCallback?: any
): any {
	return async ({ getNamedAccounts, deployments }) => {
		if (preDeployCallback)
			await preDeployCallback(deployments)

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
		if (postDeployCallback)
			await postDeployCallback(deployments, deployResult)
	}
}