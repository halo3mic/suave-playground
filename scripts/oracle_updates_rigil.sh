#!/bin/bash

while true; do
    npx hardhat oracle-updates --ticker $1 --nblocks 1000000 --network rigil
    echo "Script ended or errored out, restarting..."
    sleep 1  # Prevents spamming restarts in case of consistent immediate failure
done
