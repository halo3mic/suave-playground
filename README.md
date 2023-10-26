# 🚧 Suave Playground 🏗️

This project is under development



## Setup

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
npx hardhat deploy --tags builder --network suave
```

### Deploy MevShare contract
```
npx hardhat deploy --tags builder --network suave
```

### Build block
```
npx hardhat send-bundles --network suave
```
