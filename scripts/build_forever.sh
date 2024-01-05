#!/bin/bash

while true; do
    npx hardhat build-blocks --nslots 100000000 --blockad --network rigil
    echo "Script ended or errored out, restarting..."
    sleep 1  # Prevents spamming restarts in case of consistent immediate failure
done
