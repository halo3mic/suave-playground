// SPDX-License-Identifier: MIT
// Author: Miha Lotric (halo3mic)
pragma solidity ^0.8.8;

import { AnyBidContract, EthBlockBidSenderContract, Suave } from "../standard_peekers/bids.sol";


contract BlockAdAuctionV2 is AnyBidContract {
	using DynamicBytesUintArray for bytes;

    error BlockAdAuctionError(string message);

	struct AdRequest {
		string extra;
		uint blockLimit;
		Suave.BidId paymentBidId;
	}
	struct EffectiveAdBid {
		string extra;
		uint64 egp;
		bytes paymentBundle;
	}

	event NewAdRequest(
		uint id,
		string extra,
		uint blockLimit
	);
	event RemoveAdRequest(uint id);
	event NewIndexForAdRequest(uint oldId, uint newId);

	AdRequest[] public requests;
	EthBlockBidSenderContract public builder;

	constructor(string memory boostRelayUrl_) {
		builder = new EthBlockBidSenderContract(boostRelayUrl_);
	}

	// ON-CHAIN METHODS

	// todo: How to restrict access???
	function buyAdCallback(AdRequest calldata request) external {
		requests.push(request);
		emit NewAdRequest(requests.length-1, request.extra, request.blockLimit);
	}

	// todo: How to restrict access???
	function buildCallback(bytes memory builderCall, bytes memory _pendingRemovals) external {
		// Assume that the pendingRemovals were added in ascending order
		// Assume that pendingRemovals.length <= requests.length
		uint[] memory pendingRemovals = _pendingRemovals.export();
		for (uint i=pendingRemovals.length; i>0; --i) {
			uint indexToRemove = pendingRemovals[i-1];
			if (indexToRemove < requests.length-1) {
				requests[indexToRemove] = requests[requests.length-1];
				emit NewIndexForAdRequest(requests.length-1, indexToRemove);
			}
			requests.pop();
			emit RemoveAdRequest(indexToRemove);
		}
		// External call
		(bool success,) = address(builder).call(builderCall);
		crequire(success, "Builder call failed");
	}

	function nextRequestIndex() external view returns (uint) {
		return requests.length;
	}

	// CONFIDENTIAL METHODS

	function buyAd(
		uint64 blockLimit, 
		string memory extra
	) external returns (bytes memory) {
		crequire(Suave.isConfidential(), "Not confidential");
		// Check payment is valid for the latest state
		bytes memory paymentBundle = this.fetchBidConfidentialBundleData();
		crequire(Suave.simulateBundle(paymentBundle) != 0, "egp too low");
		
		address[] memory allowedPeekers = new address[](1);
		allowedPeekers[0] = address(this);
		Suave.Bid memory paymentBid = Suave.newBid(0, allowedPeekers, allowedPeekers, "blockad:v0:paymentBundle");
		Suave.confidentialStore(paymentBid.id, "blockad:v0:paymentBundle", paymentBundle);
		AdRequest memory request = AdRequest(extra, blockLimit, paymentBid.id);

		return abi.encodeWithSelector(this.buyAdCallback.selector, request);
	}

	function buildBlock(Suave.BuildBlockArgs memory blockArgs, uint64 blockHeight) public returns (bytes memory) {
		crequire(Suave.isConfidential(), "Not confidential");
		crequire(requests.length > 0, "No bids");

		// Find best offer and discard invalid for the present state
		EffectiveAdBid memory bestOffer;
		bytes memory pendingRemovals;
		for (uint i = 0; i < requests.length; ++i) {
			AdRequest memory request = requests[i];
			if (request.blockLimit < blockHeight) {
				pendingRemovals = pendingRemovals.append(i);
				continue;
			}
			bytes memory paymentBundle = Suave.confidentialRetrieve(
				request.paymentBidId,
				"blockad:v0:paymentBundle"
			);
			(bool success, uint64 egp) = simulateBundleSafe(paymentBundle);
			if (!success || egp == 0)
				pendingRemovals = pendingRemovals.append(i);
			else if (egp > bestOffer.egp)
				bestOffer = EffectiveAdBid(request.extra, egp, paymentBundle);
		}
		crequire(bestOffer.egp > 0, "No valid offers");

		// Prep for block building - include extra & payment bundle
		// Expect the payment on top; if someone wants to fail the payment with other tx they need higher egp than the payment tx
		address[] memory allowedPeekers = new address[](3);
		allowedPeekers[0] = address(builder);
		allowedPeekers[1] = Suave.BUILD_ETH_BLOCK;
		allowedPeekers[2] = address(this);
		Suave.Bid memory paymentBundleBid = Suave.newBid(blockHeight, allowedPeekers, allowedPeekers, "default:v0:ethBundles");
		Suave.confidentialStore(paymentBundleBid.id, "default:v0:ethBundles", bestOffer.paymentBundle);
		Suave.confidentialStore(paymentBundleBid.id, "default:v0:ethBundleSimResults", abi.encode(bestOffer.egp));
		blockArgs.extra = bytes(bestOffer.extra);
		
		bytes memory buildFromPoolCall = builder.buildFromPool(blockArgs, blockHeight);
		return abi.encodeWithSelector(this.buildCallback.selector, buildFromPoolCall, pendingRemovals);
	}

	function simulateBundleSafe(bytes memory bundle) internal view returns (bool, uint64) {
        (bool success, bytes memory egp) = Suave.SIMULATE_BUNDLE.staticcall(abi.encode(bundle));
        return (success, uint64(egp.bytesToUint(0)));
	}

    function crequire(bool condition, string memory message) internal pure {
        if (!condition)
            revert BlockAdAuctionError(message);
    }

}

library DynamicBytesUintArray {

	function append(bytes memory a, uint e) internal pure returns (bytes memory) {
		return bytes.concat(a, uintToBytes(e));
	}

	function export(bytes memory a) internal pure returns (uint[] memory) {
		return bytesToUints(a);
	}

	function uintToBytes(uint x) internal pure returns (bytes memory y) {
        assembly { mstore(add(y, 32), x) }
    }

	function bytesToUints(bytes memory xs) internal pure returns (uint[] memory ys) {
		assembly {
			let ysLength := div(mload(xs), 32)
			for { let i := 0 } lt(i, ysLength) { i := add(i, 1) } {
	            let wordPos := add(xs, add(mul(i, 32), 32))
            	let word := mload(wordPos)
				let yStart := add(ys, 32)
            	mstore(add(yStart, mul(i, 32)), word)
			}
		}
    }

	function bytesToUint(bytes memory x, uint offset) internal pure returns (uint y) {
        assembly { y := mload(add(x, offset)) }
    }

}
