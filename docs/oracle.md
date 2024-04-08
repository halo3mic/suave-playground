# Oracle setup


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
* `RIGIL_PK`: Private key for the account interacting with Suave chain on Rigil.
* `HOLESKY_PK`: Private key for the account interacting with Holesky chain.
* `EXECUTION_NODE`: Address of the account associated with your Suave execution client. Use the account generated during Suave setup.
* `SUAVE_RPC`: RPC endpoint of your Suave execution client. Use the port you specified during Suave setup.
* `RIGIL_RPC`: RPC endpoint of fb Rigil Suave execution client.
* `HOLESKY_RPC`: RPC endpoint of your Holesky client. Use the port you specified during Holesky setup.

## Deploy contracts

### Holesky settlement contract
```bash
$ npx hardhat deploy --tags oracle-settlement --network holesky
```

### Oracle contract
```bash
$ npx hardhat deploy --tags binance-oracle [--network rigil]
```
Omit the last part to deploy it on your local chain.

## Run Oracle
```bash 
$ npx hardhat oracle-updates --ticker <binance_ticker> --nblocks <number_of_blocks> --network <suave/rigil>
```

or for Rigil continuous run:

```bash 
$ ./scripts/oracle_updates_rigil.sh <binance_ticker>
```

