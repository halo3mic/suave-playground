
## Prerequisites
Unless you have Holesky execution and beacon node at hand you will need ~400GB of disk space.

## Setup SUAVE execution node for Holesky 🧪
Run Holesky network with Suave-Geth. It will run as vanilla Geth with extra methods 
`suavex_buildEthBlockFromBundles` and `suavex_buildEthBlock` which are essential for Suave block building. One can run vanilla Geth, but will need to implement the mentioned methods themself. If you have Holesky already synced just point Suave-Geth to existing db.

### Clone and build Suave-Geth

```
$ git clone https://github.com/flashbots/suave-geth
$ cd ./suave-geth
$ make geth
```
### Run SUAVE execution node

```bash
$ ./build/bin/geth --holesky --syncmode=snap --datadir $HOLESKY_DATADIR --http --http --http.api eth,net,engine,admin,suavex --http.addr 127.0.0.1 --http.port $HOLESKY_RPC_PORT
```

## Setup Suave-Geth 🤖

### Account generation 
This account will represent your Suave execution node

```bash
$ ./build/bin/geth account new --datadir $SUAVE_DATADIR
# Note that default `datadir` is `~/.ethereum`.
```
Save password in `./password`

### Genesis file

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
### Run SUAVE node
Example command for running local SUAVE network
```bash
$ ./build/bin/geth --dev --dev.gaslimit 30000000 --datadir $SUAVE_DATADIR --http --http.addr "127.0.0.1" --http.api "eth,web3,net,clique" --allow-insecure-unlock --unlock $SEALER_ADDRESS --password ./password --ws --suave.eth.remote_endpoint "http://localhost:$HOLESKY_RPC_PORT" --miner.gasprice 0 --networkid 424242 --suave.eth.external-whitelist "*"
```