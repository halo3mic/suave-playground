# 🚧 Suave Playground 🏗️


## Setup

Follow [SETUP.md](./docs/SETUP.md) to setup your environment.

### Dependencies
```
yarn install
```
### Env vars
See the sample file
```
cp .env.sample .env
```


## Usage 

### Run tests
```
npx hardhat test --network suave
```

### Deploy BlockBuilder contract
```
npx hardhat deploy --tags builder
```

### Deploy MevShare contract
```
npx hardhat deploy --tags builder
```

### Send bundles
```
npx hardhat send-bundles --nblocks N
```

### Build blocks
```
npx hardhat build-blocks --nslots N
```

### Send bids and build blocks
```
npx hardhat submit-and-build --nslots N
```
