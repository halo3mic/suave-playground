const { deployContract } = require('../deploy-utils')
const { getEnvValSafe } = require('../../utils')

const name = 'Builder'
const contractName = 'EthBlockBidSenderContract'
const args = [getEnvValSafe('GOERLI_RELAY_URL')]
const tags = 'builder'

module.exports = deployContract(name, contractName, args, tags)
