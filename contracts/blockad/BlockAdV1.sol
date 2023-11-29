// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { AnyBidContract, EthBlockBidSenderContract, Suave } from "../standard_peekers/bids.sol";


contract BlockAdAuctionV1 is AnyBidContract {

	struct AdBid {
		string extra; 
		Suave.BidId paymentBidId;
		uint blockHeight;
	}

	struct EffectiveAdBid {
		string extra;
		uint64 egp;
		bytes paymentBundle;
	}

	event AdBidEvent(
		string extra,
		uint blockNum
	);

	mapping(uint => AdBid[]) public blockToBid;
	EthBlockBidSenderContract public builder;

	constructor(string memory boostRelayUrl_) {
		// Make sure the builder contract cannot abuse the confidential payment bundle
		builder = new EthBlockBidSenderContract(boostRelayUrl_);
	}

	// ON-CHAIN METHODS

	function buyAdCallback(AdBid[] memory bids) external {
		for (uint i = 0; i < bids.length; ++i) {
			uint blockNum = bids[i].blockHeight;
			blockToBid[blockNum].push(bids[i]);
			// todo: add some form of an id to the bid
			emit AdBidEvent(bids[i].extra, blockNum);
		}
	}

	// CONFIDENTIAL METHODS

	function buyAd(
		uint64 blockStart, 
		uint64 range, 
		string memory extra
	) external returns (bytes memory) {
		require(Suave.isConfidential(), "Not confidential");
		// Check payment is valid for the latest state
		bytes memory paymentBundle = this.fetchBidConfidentialBundleData();
		require(Suave.simulateBundle(paymentBundle) != 0, "Initial sim check failed");
		
		address[] memory allowedPeekers = new address[](1);
		allowedPeekers[0] = address(this);

		AdBid[] memory bids = new AdBid[](range);
		for (uint64 b = blockStart; b < blockStart+range; b++) {
			// Store payment bundle
			Suave.Bid memory paymentBid = Suave.newBid(0, allowedPeekers, allowedPeekers, "blockad:v0:paymentBundle");
			Suave.confidentialStore(paymentBid.id, "blockad:v0:paymentBundle", paymentBundle);
			// Prepare bid data to be commited on-chain
			bids[b-blockStart] = AdBid(extra, paymentBid.id, b);
		}
		return abi.encodeWithSelector(this.buyAdCallback.selector, bids);
	}

	function buildBlock(Suave.BuildBlockArgs memory blockArgs, uint64 blockHeight) public returns (bytes memory) {
		require(Suave.isConfidential());

		AdBid[] storage blockBids = blockToBid[blockHeight];
		require(blockBids.length > 0, "No bids");

		EffectiveAdBid memory bestOffer;
		for (uint i = 0; i < blockBids.length; ++i) {
			bytes memory paymentBundle = Suave.confidentialRetrieve(
				blockBids[i].paymentBidId, 
				"blockad:v0:paymentBundle"
			);
			uint64 egp = Suave.simulateBundle(paymentBundle);
			if (egp > bestOffer.egp)
				bestOffer = EffectiveAdBid(blockBids[i].extra, egp, paymentBundle);
			// todo: if egp == 0, delete all of their bids for the next blocks (when someone wins an ad, discard their subsequent(pending) bids)
		}
		delete blockToBid[blockHeight];

		// Prep for block building - include extra & payment bundle
		if (bestOffer.egp > 0)
			blockArgs.extra = bytes(bestOffer.extra);
		// Expect the payment on top; if someone wants to fail the payment with other txs they have to have higher egp than the payment tx
		address[] memory allowedPeekers = new address[](3);
		allowedPeekers[0] = address(builder);
		allowedPeekers[1] = Suave.BUILD_ETH_BLOCK;
		allowedPeekers[2] = address(this);
		Suave.Bid memory paymentBundleBid = Suave.newBid(blockHeight, allowedPeekers, allowedPeekers, "default:v0:ethBundles");
		Suave.confidentialStore(paymentBundleBid.id, "default:v0:ethBundles", bestOffer.paymentBundle);
		Suave.confidentialStore(paymentBundleBid.id, "default:v0:ethBundleSimResults", abi.encode(bestOffer.egp));
		
		return builder.buildFromPool(blockArgs, blockHeight);
	}

}
