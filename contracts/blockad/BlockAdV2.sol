// SPDX-License-Identifier: MIT
// Author: Miha Lotric (halo3mic)

pragma solidity ^0.8.8;

import { AnyBidContract, EthBlockBidSenderContract, Suave } from "../standard_peekers/bids.sol";
import "./lib/ConfidentialControl.sol";
import "./lib/TypeConversion.sol";


contract BlockAdAuctionV2 is AnyBidContract, ConfidentialControl {
	using UintBytes for bytes;

	struct AdRequest {
		uint id;
		string extra;
		uint blockLimit;
		Suave.BidId paymentBidId;
	}
	struct Offer {
		string extra;
		uint64 egp;
		bytes paymentBundle;
	}

	event RequestAdded(uint id, string extra, uint blockLimit);
	event RequestRemoved(uint id);
	event RequestIncluded(uint id, uint64 egp);

	string constant PB_NAMESPACE = "blockad:v0:paymentBundle";
	string constant EB_NAMESPACE = "default:v0:ethBundles";
	string constant EB_SIM_NAMESPACE = "default:v0:ethBundleSimResults";
	EthBlockBidSenderContract public builder;
	AdRequest[] public requests;

	constructor(string memory boostRelayUrl_) {
		builder = new EthBlockBidSenderContract(boostRelayUrl_);
	}

	/**********************************************************************
    *                           ⛓️ ON-CHAIN METHODS                       *
    ***********************************************************************/

	function confidentialConstructor() public view override returns (bytes memory) {
		return ConfidentialControl.confidentialConstructor();
	}

	function buyAdCallback(
		AdRequest calldata request,
		UnlockArgs calldata uArgs
	) unlock(uArgs) external {
		requests.push(request);
		emit RequestAdded(requests.length-1, request.extra, request.blockLimit);
	}

	function buildCallback(
		bytes memory builderCall,
		bytes memory includedRequestB,
		bytes memory pendingRemovalsB,
		UnlockArgs calldata uArgs
	) unlock(uArgs) external {
		handleIncludedRequest(includedRequestB);
		removeRequests(pendingRemovalsB.export());
		executeExternalCallback(address(builder), builderCall);
	}

	function nextRequestIndex() public view returns (uint) {
		return requests.length;
	}

	/**********************************************************************
    *                         🔒 CONFIDENTIAL METHODS                      *
    ***********************************************************************/

	function buyAd(
		uint64 blockLimit, 
		string memory extra
	) onlyConfidential() external returns (bytes memory) {
		bytes memory paymentBundle = this.fetchBidConfidentialBundleData();
		crequire(Suave.simulateBundle(paymentBundle) != 0, "egp too low");
		Suave.BidId paymentBidId = storePaymentBundle(paymentBundle);
		uint rid = nextRequestIndex();
		AdRequest memory request = AdRequest(rid, extra, blockLimit, paymentBidId);
		return abi.encodeWithSelector(this.buyAdCallback.selector, request, getUnlockPair());
	}

	function buildBlock(
		Suave.BuildBlockArgs memory blockArgs, 
		uint64 blockHeight
	) onlyConfidential() public returns (bytes memory) {
		crequire(requests.length > 0, "No requests");
		(Offer memory bestOffer, bytes memory removals) = filterOffers(blockHeight);
		crequire(bestOffer.egp > 0, "No valid offers");

		storeBundleInPool(blockHeight, bestOffer);
		blockArgs.extra = bytes(bestOffer.extra);
		// Expect flow is ordered by egp; if one wants to fail payment they need higher egp
		bytes memory externalCallback = builder.buildFromPool(blockArgs, blockHeight);

		return abi.encodeWithSelector(
			this.buildCallback.selector, 
			externalCallback, 
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
		for (uint i=pendingRemovals.length; i>0; --i) {
			uint indexToRemove = pendingRemovals[i-1];
			uint requestId = requests[indexToRemove].id;
			if (indexToRemove < requests.length-1) {
				requests[indexToRemove] = requests[requests.length-1];
			}
			requests.pop();
			emit RequestRemoved(requestId);
		}
	}

	function handleIncludedRequest(bytes memory includedRequestB) internal {
		(uint id, uint64 egp) = abi.decode(includedRequestB, (uint, uint64));
		emit RequestIncluded(id, egp);
	}

	function executeExternalCallback(address target, bytes memory data) internal {
		(bool success,) = target.call(data);
		crequire(success, "External call failed");
	}

	function storePaymentBundle(bytes memory paymentBundle) internal view returns (Suave.BidId) {
		address[] memory peekers = new address[](1);
		peekers[0] = address(this);
		Suave.Bid memory paymentBid = Suave.newBid(0, peekers, peekers, PB_NAMESPACE);
		Suave.confidentialStore(paymentBid.id, PB_NAMESPACE, paymentBundle);
		return paymentBid.id;
	}

	function filterOffers(uint blockHeight)
		internal
		view
		returns (Offer memory bestOffer, bytes memory removals) 
	{
		for (uint i = 0; i < requests.length; ++i) {
			AdRequest memory request = requests[i];
			if (request.blockLimit < blockHeight) {
				removals = removals.append(i);
				continue;
			}
			bytes memory paymentBundle = Suave.confidentialRetrieve(
				request.paymentBidId,
				PB_NAMESPACE
			);
			(bool success, uint64 egp) = simulateBundleSafe(paymentBundle);
			if (!success || egp == 0)
				removals = removals.append(i);
			else if (egp > bestOffer.egp)
				bestOffer = Offer(request.extra, egp, paymentBundle);
		}
	}

	function storeBundleInPool(uint64 blockHeight, Offer memory bestOffer) internal {
		address[] memory allowedPeekers = new address[](3);
		allowedPeekers[0] = address(builder);
		allowedPeekers[1] = Suave.BUILD_ETH_BLOCK;
		allowedPeekers[2] = address(this);
		Suave.Bid memory paymentBundleBid = Suave.newBid(blockHeight, allowedPeekers, allowedPeekers, EB_NAMESPACE);
		Suave.confidentialStore(paymentBundleBid.id, EB_NAMESPACE, bestOffer.paymentBundle);
		Suave.confidentialStore(paymentBundleBid.id, EB_SIM_NAMESPACE, abi.encode(bestOffer.egp));
	}

}

