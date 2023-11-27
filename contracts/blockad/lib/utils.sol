// SPDX-License-Identifier: MIT
// Author: Miha Lotric (halo3mic)
pragma solidity ^0.8.8;

import { AnyBidContract, EthBlockBidSenderContract, Suave } from "../../standard_peekers/bids.sol";

// todo: split in seperate files

abstract contract SuaveContract {
    using DynamicBytesUintArray for bytes;

    error BlockAdAuctionError(string message); // todo: rename

	modifier onlyConfidential() {
		crequire(Suave.isConfidential(), "Not confidential");
		_;
	}

	function simulateBundleSafe(bytes memory bundle) internal view returns (bool, uint64) {
        (bool success, bytes memory egp) = Suave.SIMULATE_BUNDLE.staticcall(abi.encode(bundle));
        return (success, uint64(egp.toUint()));
	}

    function crequire(bool condition, string memory message) internal pure {
        if (!condition)
            revert BlockAdAuctionError(message);
    }

	// todo: static to dynamic array
}

// todo: check for confidential env for internal methods? (could be expensive)
abstract contract SecretContract is SuaveContract {

    struct UnlockPair {
        bytes32 key;
        bytes32 nextHash;
    }

	modifier access(UnlockPair calldata unlockPair) {
		crequire(isValidKey(unlockPair.key), "Invalid key");
		_;
        presentHash = unlockPair.nextHash;
        nonce++;
	}

	uint nonce;
	bytes32 presentHash;
    Suave.BidId secretBidId;

	// ON-CHAIN PUBLIC METHODS

    function isInitialized() public view returns (bool) {
        return presentHash != 0;
    }

	function initSecretCallback(bytes32 _nextHash) external {
		crequire(!isInitialized(), "Already initialized");
		presentHash = _nextHash;
	}

	function isValidKey(bytes32 key) internal view returns (bool) {
		return keccak256(abi.encode(key)) == presentHash;
	}

	// CONFIDENTIAL METHODS

	function confidentialConstructor() onlyConfidential() public view returns (bytes memory) {
        crequire(!isInitialized(), "Already initialized");
        bytes memory secret = Suave.confidentialInputs();
		address[] memory peekers = new address[](3);
		peekers[0] = address(this);
        peekers[1] = Suave.FETCH_BIDS;
        peekers[2] = Suave.CONFIDENTIAL_RETRIEVE;
		Suave.Bid memory secretBid = Suave.newBid(0, peekers, peekers, "blockad:v0:secret");
		Suave.confidentialStore(secretBid.id, "blockad:v0:secret", secret);
        bytes32 nextHash = makeHash(abi.decode(secret, (bytes32)), nonce);

        return abi.encodeWithSelector(this.initSecretCallback.selector, nextHash, secretBid.id);
	}

    // INTERNAL METHODS

    function getUnlockPair() internal view returns (UnlockPair memory) {
        return UnlockPair(getKey(nonce), getNextHash());
    }

    function getNextHash() internal view returns (bytes32) {
        return getHash(nonce + 1);
    }

	function getHash(uint _nonce) internal view returns (bytes32) {
		return keccak256(abi.encode(getKey(_nonce)));
	}

    function makeHash(bytes32 secret, uint _nonce) internal pure returns (bytes32) {
        return keccak256(abi.encode(makeKey(secret, _nonce)));
    }

	function getKey(uint _nonce) internal view returns (bytes32) {
		return makeKey(getSecret(), _nonce);
	}

    function makeKey(bytes32 secret, uint _nonce) internal pure returns (bytes32) {
        return keccak256(abi.encode(secret, _nonce));
    }

	function getSecret() internal view returns (bytes32) {
        bytes memory secretB = Suave.confidentialRetrieve(secretBidId, "blockad:v0:secret");
		bytes32 secret = abi.decode(secretB, (bytes32));
        crequire(secret != 0, "No secret");
        return secret;
	}

}

library DynamicBytesUintArray {

	function append(bytes memory a, uint e) internal pure returns (bytes memory) {
		return bytes.concat(a, toBytes(e));
	}

	function export(bytes memory xs) internal pure returns (uint[] memory) {
		return toUints(xs);
	}

	function toBytes(uint x) internal pure returns (bytes memory y) {
        return abi.encode(x);
    }

	function toUints(bytes memory xs) internal pure returns (uint[] memory ys) {
		return abi.decode(xs, (uint[]));
    }

	function toUint(bytes memory x) internal pure returns (uint y) {
        return abi.decode(x, (uint));
    }

}


// library DynamicBytesUintArray {

// 	function append(bytes memory a, uint e) internal pure returns (bytes memory) {
// 		return bytes.concat(a, uintToBytes(e));
// 	}

// 	function export(bytes memory a) internal pure returns (uint[] memory) {
// 		return bytesToUints(a);
// 	}

// 	function uintToBytes(uint x) internal pure returns (bytes memory y) {
//         assembly { mstore(add(y, 32), x) }
//     }

// 	function bytesToUints(bytes memory xs) internal pure returns (uint[] memory ys) {
// 		assembly {
// 			let ysLength := div(mload(xs), 32)
// 			for { let i := 0 } lt(i, ysLength) { i := add(i, 1) } {
// 	            let wordPos := add(xs, add(mul(i, 32), 32))
//             	let word := mload(wordPos)
// 				let yStart := add(ys, 32)
//             	mstore(add(yStart, mul(i, 32)), word)
// 			}
// 		}
//     }

// 	function bytesToUint(bytes memory x, uint offset) internal pure returns (uint y) {
//         assembly { y := mload(add(x, offset)) }
//     }

// }