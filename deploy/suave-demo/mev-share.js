const { deployContract } = require('../deploy-utils')

const name = 'MevShare'
const contractName = 'MevShareBidContract'
const args = []
const tags = 'mevshare'

module.exports = deployContract(name, contractName, args, tags)
