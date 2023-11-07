
This is a guide to setup components allowing you to build and submit Goerli blocks to Flashbots's relay via Suave. It is not the offical nor the only way, just what worked for me.


## Prerequisites
Have Golang, Git and NodeJS installed. Unless Goerli execution and beacon chain are available you will need ~400GB of disk space.

## Setup Goerli-Geth
Run Goerli network with Suave-Geth. It will run as vanilla Geth with extra methods 
`suavex_buildEthBlockFromBundles` and `suavex_buildEthBlock` which are essential for Suave block building. One can run vanilla Geth, but will need to implement mentioned methods themself. If you have Goerli already synced just point Suave-Geth to exisiting db.

### Clone and build Suave-Geth

```
$ git clone https://github.com/flashbots/suave-geth
$ cd ./suave-geth
$ make geth
```
### Run Goerli

```bash
$ ./build/bin/geth --goerli --syncmode=snap --datadir $GOERLI_DATADIR --http --http --http.api eth,net,engine,admin,suavex --http.addr 127.0.0.1 --http.port $GOERLI_RPC_PORT
```
 
## Setup Beacon Node
To submit the block to the relay you will need to listen for latest beacon node's `payload_attributes` which are required for block submission to the relay.

If you don't have beacon node, set it up. For example, follow offical Prysm instructions [here](https://docs.prylabs.network/docs/install/install-with-script).

## Setup Suave-Geth

### Account generation 
This account will represent your Suave execution node

```bash
$ ./build/bin/geth account new --datadir $SUAVE_DATADIR
# Note that default `datadir` is `~/.ethereum`.
```
Write password to `./password`
```
$ echo "<account password>" > ./password
```

### Genesis file

Below is an example of `genesis.json` file for running Clique Proof of Authority consensus and allocating funds to specified accounts. Proof of Authority needs sealer specified in `extradata` field as shown in example.

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

### Run Suave execution node
```bash
$ ./build/bin/geth --dev --dev.gaslimit 30000000 --datadir $SUAVE_DATADIR --http --http.addr "0.0.0.0" --http.api "eth,web3,net,clique" --allow-insecure-unlock --unlock $SEALER_ADDRESS --password ./password --ws --suave.eth.remote_endpoint "http://localhost:$GOERLI_RPC_PORT" --miner.gasprice 0
```

## Build a block via Suave-playground 

### Fill account with Goerli ETH
You will need Goerli account with GETH to pay for gas fees. 
There are numerous ways to do this, one is via this [POW faucet](https://goerli-faucet.pk910.de/).


### Setup Suave-Playground

Clone the repo and install dependencies
```bash
$ git clone https://github.com/halo3mic/suave-playground
$ cd ./suave-playground
$ yarn install
```

Create `.env` file based on `.env.sample`
* `SUAVE_PK`: Private key for the account interacting with Suave chain
* `GOERLI_PK`: Private key for the account interacting with Goerli chain
* `EXECUTION_NODE`: Address of the account associated with your Suave execution client. Use the account generated during Suave setup.


### Build and broadcast a block to the relay

```
$ npx hardhat submit-and-build --nslots <num of slots to bid for>
```

