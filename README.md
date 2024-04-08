# 🚧 Suave POC Playground 🏗️

Welcome to the Suave POC Playground! This repository serves as a guide for setting up a local environment to build and submit Holesky blocks to Flashbots's relay using Suave. It's designed based on my personal successful configurations and is meant to be an aid rather than an official guideline.

Please note that Suave is an actively developed project, and with new updates, this repository might become outdated. Always refer to the official Suave-Geth repository for the latest changes.

## Prerequisites
Have the latest Golang, Git and NodeJS installed. Unless you have Holesky execution and beacon node at hand you will need ~400GB of disk space.

## Setup Holesky 🧪
Run Holesky network with Suave-Geth. It will run as vanilla Geth with extra methods 
`suavex_buildEthBlockFromBundles` and `suavex_buildEthBlock` which are essential for Suave block building. One can run vanilla Geth, but will need to implement the mentioned methods themself. If you have Holesky already synced just point Suave-Geth to existing db.

#### Clone and build Suave-Geth

```
$ git clone https://github.com/flashbots/suave-geth
$ cd ./suave-geth
$ make geth
```
#### Run Holesky

```bash
$ ./build/bin/geth --holesky --syncmode=snap --datadir $HOLESKY_DATADIR --http --http --http.api eth,net,engine,admin,suavex --http.addr 127.0.0.1 --http.port $HOLESKY_RPC_PORT
```
 
## Setup Beacon Node 📡
To submit the block to the relay, you will need to listen for the latest beacon node's `payload_attributes`, which are required for block submission to the relay.

If you don't have a beacon node, set it up. For example, follow official Prysm instructions [here](https://docs.prylabs.network/docs/install/install-with-script).

## Setup Suave-Geth 🤖

#### Account generation 
This account will represent your Suave execution node

```bash
$ ./build/bin/geth account new --datadir $SUAVE_DATADIR
# Note that default `datadir` is `~/.ethereum`.
```
Save password in `./password`

#### Genesis file

Below is an example of `genesis.json` file for running Clique Proof of Authority consensus and allocating funds to specified accounts. Proof of Authority needs a sealer specified in `extradata` field, as shown in the example.

```json
{
  "config": {
    "chainId": 424242,
    "homesteadBlock": 0,
    "eip150Block": 0,
    "eip155Block": 0,
    "eip158Block": 0,
    "byzantiumBlock": 0,
    "constantinopleBlock": 0,
    "petersburgBlock": 0,
    "istanbulBlock": 0,
    "berlinBlock": 0,
    "suaveBlock": 0,
    "clique": {
      "period": 5,
      "epoch": 30000
    }
  },
  "difficulty": "1",
  "gasLimit": "30000000",
  "extradata": "0x0000000000000000000000000000000000000000000000000000000000000000<SEALER_ADDRESS>0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  "alloc": {
    "<ALLOC_ADDRESS>": {
      "balance": "<ALLOC_AMOUNT_SETH>"
    }
  }
}
```
Add file to the root of the folder and create a genesis block.
```bash
$ ./build/bin/geth init ./genesis.json --datadir $SUAVE_DATADIR
```

#### Run Suave execution node
```bash
$ ./build/bin/geth --dev --dev.gaslimit 30000000 --datadir $SUAVE_DATADIR --http --http.addr "127.0.0.1" --http.api "eth,web3,net,clique" --allow-insecure-unlock --unlock $SEALER_ADDRESS --password ./password --ws --suave.eth.remote_endpoint "http://localhost:$HOLESKY_RPC_PORT" --miner.gasprice 0
```

## Build a block via Suave-playground 👷‍♂️

### Fill account with Holesky ETH
You will need Holesky account with GETH to pay for gas fees. 
There are numerous ways to do this, one is via this [POW faucet](https://holesky-faucet.pk910.de/).


#### Setup Suave-Playground

Clone the repo and install dependencies
```
$ git clone https://github.com/halo3mic/suave-playground
$ cd ./suave-playground
$ yarn install
```

Create `.env` file based on [`.env.sample`](./.env.sample) and fill in the following fields:
* `SUAVE_PK`: Private key for the account interacting with Suave chain
* `HOLESKY_PK`: Private key for the account interacting with Holesky chain
* `EXECUTION_NODE`: Address of the account associated with your Suave execution client. Use the account generated during Suave setup.
* `SUAVE_RPC`: RPC endpoint of your Suave execution client. Use the port you specified during Suave setup.
* `HOLESKY_RPC`: RPC endpoint of your Holesky client. Use the port you specified during Holesky setup.
* `BEACON_NODE`: RPC endpoint of your beacon node. Use the port you specified during beacon node setup.
* `HOLESKY_RELAY`: RPC endpoint of the Holesky relay. Use `https://relay-holesky.flashbots.net`.

#### Deploy Builder and MevShare contracts
```
$ npx hardhat deploy --tags builder,mevshare,blockad
```

#### Send bids, build blocks and broadcast them to the relay

Combined (recommended)
```
$ npx hardhat send-bundles --nslots <number_of_slots> --build
```

Only send bundles
```
$ npx hardhat send-bundles --nslots <number_of_slots>
```

Only build blocks
```
$ npx hardhat build-blocks --nslots <number_of_slots>
```

#### Submit ad-request, build block and broadcast it to the relay
Example:
```
$ npx hardhat block-ad --extra "So Extra 🔥" --adbid 0.2 --blockrange 10 --build
```


## Contributions
Please feel free to contribute, let's build together! 💪

~ [X](https://twitter.com/MihaLotric)
