#!/bin/bash

npx hardhat block-ad-init --network toliman

mkdir -p ~/.log
echo "BlockAd init executed on $(date)" >> ~/.log/suave-reinit.log