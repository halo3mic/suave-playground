#!/bin/bash

while true; do
    npx hardhat build-blocks --nslots 100000000 --blockad --network toliman
    echo "Script ended or errored out, restarting..."
    sleep 1
done
