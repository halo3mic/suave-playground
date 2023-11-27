// SPDX-License-Identifier: MIT
// Author: Miha Lotric (halo3mic)
pragma solidity ^0.8.8;

import { AnyBidContract, EthBlockBidSenderContract, Suave } from "../standard_peekers/bids.sol";
import { SecretContract, DynamicBytesUintArray } from "./lib/utils.sol";


contract BlockAdAuctionV2 is AnyBidContract, SecretContract {
	using DynamicBytesUintArray for bytes;

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

	function confidentialConstructor() public view override returns (bytes memory) {
		return SecretContract.confidentialConstructor();
	}

	function buyAdCallback(
		AdRequest calldata request,
		UnlockPair calldata unlockPair
	) access(unlockPair) external {
		requests.push(request);
		emit NewAdRequest(requests.length-1, request.extra, request.blockLimit);
	}

	function buildCallback(
		bytes memory builderCall, 
		bytes memory _pendingRemovals,
		UnlockPair calldata unlockPair
	) access(unlockPair) external {
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
		// todo: emit the one who won the block

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
	) onlyConfidential() external returns (bytes memory) {
		// Check payment is valid for the latest state
		bytes memory paymentBundle = this.fetchBidConfidentialBundleData();
		crequire(Suave.simulateBundle(paymentBundle) != 0, "egp too low");
		
		address[] memory allowedPeekers = new address[](1);
		allowedPeekers[0] = address(this);
		Suave.Bid memory paymentBid = Suave.newBid(0, allowedPeekers, allowedPeekers, "blockad:v0:paymentBundle");
		Suave.confidentialStore(paymentBid.id, "blockad:v0:paymentBundle", paymentBundle);
		AdRequest memory request = AdRequest(extra, blockLimit, paymentBid.id);

		return abi.encodeWithSelector(this.buyAdCallback.selector, request, getUnlockPair());
	}

	function buildBlock(
		Suave.BuildBlockArgs memory blockArgs, 
		uint64 blockHeight
	) onlyConfidential() public returns (bytes memory) {
		crequire(requests.length > 0, "No requests");
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
		return abi.encodeWithSelector(this.buildCallback.selector, buildFromPoolCall, pendingRemovals, getUnlockPair());
	}

}

