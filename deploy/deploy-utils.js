
function deployContract(name, contractName, args, tags, optionalArgs={}) {
    const exportEnv = _deployContract(name, contractName, args, optionalArgs)
    exportEnv.tags = tags
    return exportEnv
}

function _deployContract(name, contractName, args, optionalArgs={}) {
    return async ({ getNamedAccounts, deployments }) => {
        const { deploy, log } = deployments
        const { deployer } = await getNamedAccounts()

        log(name)
        const deployResult = await deploy(name, {
            from: deployer,
            contract: contractName,
            args,
            gas: 1.5e5,
            skipIfAlreadyDeployed: true, 
            ...optionalArgs
        })

        if (deployResult.newlyDeployed) {
            log(`- ${deployResult.contractName} deployed at ${deployResult.address} using ${deployResult.receipt.gasUsed} gas`);
        } else {
            log(`- Deployment skipped, using previous deployment at: ${deployResult.address}`)
        }
    }
}

module.exports.deployContract = deployContract