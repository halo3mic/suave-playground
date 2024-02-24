// SPDX-License-Identifier: MIT
// Author: Miha Lotric (halo3mic)

// 🚨 THIS IS UNTESTED DEMO CODE - DONT USE IN PRODUCTION 🚨


pragma solidity ^0.8.8;

import '../../libraries/Suave.sol';


function floatToInt(string memory floatString, uint8 decimals) pure returns (uint) {
    bytes memory stringBytes = bytes(floatString);
    uint dotPosition;
    
    // Find the position of the dot
    for (uint i = 0; i < stringBytes.length; i++) {
        if (stringBytes[i] == 0x2E) {
            dotPosition = i;
            break;
        }
    }
    
    uint integerPart = 0;
    uint decimalPart = 0;
    uint tenPower = 1;
    
    // Convert integer part
    for (uint i = dotPosition; i > 0; i--) {
        integerPart += (uint8(stringBytes[i - 1]) - 48) * tenPower;
        tenPower *= 10;
    }
    
    // Reset power of ten
    tenPower = 1;
    
    // Convert decimal part
    for (uint i = dotPosition+decimals; i > dotPosition; i--) {
        decimalPart += (uint8(stringBytes[i]) - 48) * tenPower;
        tenPower *= 10;
    }
    
    // Combine integer and decimal parts
    return integerPart * (10**decimals) + decimalPart;
}

function trimStrEdges(string memory _input) pure returns (string memory) {
    bytes memory input = bytes(_input);
    require(input.length > 2, "Input too short");

    uint newLength = input.length - 2;
    bytes memory result = new bytes(newLength);

    assembly {
        let inputPtr := add(input, 0x21)
        let resultPtr := add(result, 0x20)
        let length := mload(input)
        mstore(resultPtr, mload(inputPtr))
        mstore(result, newLength)
    }
    return string(result);
}

function getAddressForPk(string memory pk) view returns (address) {
    bytes32 digest = keccak256(abi.encode("yo"));
    bytes memory sig = Suave.signMessage(abi.encodePacked(digest), pk);
    return recoverSigner(digest, sig);
}

function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature) pure returns (address) {
    (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);
    return ecrecover(_ethSignedMessageHash, v, r, s);
}

function splitSignature(bytes memory sig) pure returns (bytes32 r, bytes32 s, uint8 v) {
    require(sig.length == 65, "invalid signature length");
    assembly {
        r := mload(add(sig, 32))
        s := mload(add(sig, 64))
        v := byte(0, mload(add(sig, 96)))
    }
    if (v < 27) {
        v += 27;
    }
}