// SPDX-License-Identifier: MIT
// Author: Miha Lotric (halo3mic)

pragma solidity ^0.8.8;

import { AnyBundleContract, Suave } from "../standard_peekers/bids.sol";
import { ConfidentialControl } from "./lib/ConfidentialControl.sol";
import { DynamicUintArray } from "./lib/Utils.sol";
import { Builder } from "./lib/Builder.sol";


contract BlockAdAuctionV2 is AnyBundleContract, ConfidentialControl {
	using DynamicUintArray for bytes;

	struct AdRequest {
		uint id;
		string extra;
		uint blockLimit;
		Suave.DataId paymentBidId;
	}
	struct Offer {
		uint id;
		string extra;
		uint64 egp;
		bytes paymentBundle;
	}

	event RequestAdded(uint indexed id, string extra, uint blockLimit);
	event RequestRemoved(uint indexed id);
	event RequestIncluded(uint indexed id, uint64 egp, string blockHash);

	string internal constant PB_NAMESPACE = "blockad:v0:paymentBundle";
	string internal constant EB_NAMESPACE = "default:v0:ethBundles";
	string internal constant EB_SIM_NAMESPACE = "default:v0:ethBundleSimResults";
	Builder public builder;
	AdRequest[] public requests;
	uint public nextId;

	/**********************************************************************
	 *                           ⛓️ ON-CHAIN METHODS                       *
	 ***********************************************************************/

	constructor(string memory boostRelayUrl_) {
		builder = new Builder(boostRelayUrl_);
	}

	function buyAdCallback(AdRequest calldata request, UnlockArgs calldata uArgs) external unlock(uArgs) {
		requests.push(request);
		nextId++;
		emit RequestAdded(request.id, request.extra, request.blockLimit);
	}

	function buildCallback(
		bytes memory builderCall,
		bytes memory includedRequestB,
		bytes memory pendingRemovalsB,
		UnlockArgs calldata uArgs
	) external unlock(uArgs) {
		if (pendingRemovalsB.length > 0) {
			removeRequests(pendingRemovalsB.export());
		}
		string memory blockHash = handleBuilderCallback(address(builder), builderCall);
		handleIncludedRequest(includedRequestB, blockHash);
	}

	function requestsLength() public view returns (uint) {
		return requests.length;
	}

	/**********************************************************************
	 *                         🔒 CONFIDENTIAL METHODS                      *
	 ***********************************************************************/

	function confidentialConstructor() public override onlyConfidential returns (bytes memory) {
		return ConfidentialControl.confidentialConstructor();
	}

	function buyAd(uint64 blockLimit, string memory extra) external onlyConfidential returns (bytes memory) {
		bytes memory paymentBundle = this.fetchConfidentialBundleData();
		(,uint64 egp) = simulateBundleSafe(paymentBundle, true);
		crequire(egp > 0, "egp too low");
		Suave.DataId paymentBidId = storePaymentBundle(paymentBundle);
		AdRequest memory request = AdRequest(nextId, extra, blockLimit, paymentBidId);
		return abi.encodeWithSelector(this.buyAdCallback.selector, request, getUnlockPair());
	}

	function buildBlock(
		Suave.BuildBlockArgs memory blockArgs,
		uint64 blockHeight
	) public onlyConfidential returns (bytes memory) {
		crequire(requests.length > 0, "No requests");
		(Offer memory bestOffer, bytes memory removals) = filterOffers(blockHeight);
		crequire(bestOffer.egp > 0, "No valid offers");

		storeBundleInPool(blockHeight, bestOffer);
		blockArgs.extra = bytes(bestOffer.extra);
		// Expect flow is ordered by egp; if one wants to fail payment they need higher egp
		bytes memory externalCallback = builder.buildFromPool(blockArgs, blockHeight);

		return
			abi.encodeWithSelector(
				this.buildCallback.selector,
				externalCallback,
				abi.encode(bestOffer.id, bestOffer.egp),
				removals,
				getUnlockPair()
			);
	}

	/**********************************************************************
	 *                         🛠️ INTERNAL METHODS                          *
	 ***********************************************************************/

	function removeRequests(uint[] memory pendingRemovals) internal {
		// Assume that the pendingRemovals were added in ascending order
		// Assume that pendingRemovals.length <= requests.length
		for (uint i = pendingRemovals.length; i > 0; --i) {
			uint indexToRemove = pendingRemovals[i - 1];
			uint requestId = requests[indexToRemove].id;
			if (indexToRemove < requests.length - 1) {
				requests[indexToRemove] = requests[requests.length - 1];
			}
			requests.pop();
			emit RequestRemoved(requestId);
		}
	}

	function handleIncludedRequest(bytes memory includedRequestB, string memory blockHash) internal {
		(uint id, uint64 egp) = abi.decode(includedRequestB, (uint, uint64));
		emit RequestIncluded(id, egp, blockHash);
	}

	function handleBuilderCallback(address target, bytes memory data) internal returns (string memory) {
		(bool success, bytes memory res) = target.call(data);
		crequire(success, "External call failed");
		return abi.decode(res, (string));
	}

	function storePaymentBundle(bytes memory paymentBundle) internal returns (Suave.DataId) {
		address[] memory peekers = new address[](1);
		peekers[0] = address(this);
		Suave.DataRecord memory paymentBid = Suave.newDataRecord(0, peekers, peekers, PB_NAMESPACE);
		Suave.confidentialStore(paymentBid.id, PB_NAMESPACE, paymentBundle);
		return paymentBid.id;
	}

	function filterOffers(uint blockHeight) internal returns (Offer memory bestOffer, bytes memory removals) {
		for (uint i; i < requests.length; ++i) {
			AdRequest memory request = requests[i];
			if (request.blockLimit < blockHeight) {
				removals = removals.append(i);
				continue;
			}
			bytes memory paymentBundle = Suave.confidentialRetrieve(request.paymentBidId, PB_NAMESPACE);
			(bool success, uint64 egp) = simulateBundleSafe(paymentBundle, false);
			if (!success || egp == 0) {
				removals = removals.append(i);
			} else if (egp > bestOffer.egp) {
				bestOffer = Offer(request.id, request.extra, egp, paymentBundle);
			}
		}
	}

	function storeBundleInPool(uint64 blockHeight, Offer memory bestOffer) internal {
		address[] memory allowedPeekers = new address[](3);
		allowedPeekers[0] = address(builder);
		allowedPeekers[1] = Suave.BUILD_ETH_BLOCK;
		allowedPeekers[2] = address(this);
		Suave.DataRecord memory paymentBundleBid = Suave.newDataRecord(
			blockHeight, 
			allowedPeekers, 
			allowedPeekers, 
			EB_NAMESPACE
		);
		Suave.confidentialStore(paymentBundleBid.id, EB_NAMESPACE, bestOffer.paymentBundle);
		Suave.confidentialStore(paymentBundleBid.id, EB_SIM_NAMESPACE, abi.encode(bestOffer.egp));
	}
}
