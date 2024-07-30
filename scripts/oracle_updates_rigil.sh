#!/bin/bash

while true; do
    npx hardhat oracle-updates --ticker $1 --nblocks 1000000 --network toliman
    echo "Script ended or errored out, restarting..."
    sleep 1
done
