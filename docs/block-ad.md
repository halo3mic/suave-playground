# BlockAd setup


## Env setup 
### Dependencies
Clone the repo and install dependencies
```
$ git clone https://github.com/halo3mic/suave-playground
$ cd ./suave-playground
$ yarn install
```

### Environmental variables

Create `.env` file based on [`.env.sample`](./.env.sample) and fill in the following fields:
* `SUAVE_PK`: Private key for the account interacting with your local Suave chain.
* `TOLIMAN_PK`: Private key for the account interacting with Suave chain on Toliman.
* `HOLESKY_PK`: Private key for the account interacting with Holesky chain.
* `SUAVE_RPC`: RPC endpoint of your Suave execution client. Use the port you specified during Suave setup.
* `TOLIMAN_RPC`: RPC endpoint of fb Toliman Suave execution client.
* `HOLESKY_RPC`: RPC endpoint of your Holesky client. Use the port you specified during Holesky setup.

### Beacon Node 
To submit the block to the relay, you will need to listen for the latest beacon node's `payload_attributes`, which are required for block submission to the relay.

If you don't have a beacon node, set it up. For example, follow official Prysm instructions [here](https://docs.prylabs.network/docs/install/install-with-script).


### Local nodes

If you wish to run local SUAVE nodes, including SUAVE execution geth, follow the [local-development](./local-setup.md) doc.

## Deploy contracts
```
$ npx hardhat deploy --tags blockad --network <network>
```

## Usage
Submit ad-request, build block and broadcast it to the relay
```bash 
$ npx hardhat block-ad --extra "So Extra 🔥" --adbid 0.2 --nslots 10 --build
```