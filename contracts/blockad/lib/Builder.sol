// SPDX-License-Identifier: MIT
// Author: Miha Lotric (halo3mic)

pragma solidity ^0.8.8;

import { EthBlockContract, Suave } from "../../standard_peekers/bids.sol";
import { SuaveContract } from "./SuaveContract.sol";


contract Builder is EthBlockContract, SuaveContract {
	string constant BB_NAMESPACE = "blockad:v0:builderBid";
	string boostRelayUrl;

	event RelaySubmission(bytes32 bidId);

	constructor(string memory boostRelayUrl_) {
		boostRelayUrl = boostRelayUrl_;
	}

	function buildAndEmitCallback(string memory blockHash, bytes32 id) external returns (string memory) {
		emit RelaySubmission(id);
		return blockHash;
	}

	function buildAndEmit(
		Suave.BuildBlockArgs memory blockArgs,
		uint64 blockHeight,
		Suave.DataId[] memory bids,
		string memory
	) public virtual override onlyConfidential returns (bytes memory) {
		(,bytes memory builderBid) = this.doBuild(blockArgs, blockHeight, bids, boostRelayUrl); // Also submits to relay
		string memory blockHash = extractBlockHash(builderBid, blockArgs.slot);
		return abi.encodeWithSelector(this.buildAndEmitCallback.selector, blockHash, keccak256(builderBid));
	}

	function submitBlock(uint slot) external onlyConfidential returns (bytes memory) {
		bytes memory builderBid = Suave.confidentialInputs();
		submitToRelay(builderBid);
		string memory blockHash = extractBlockHash(builderBid, slot);
		return abi.encodeWithSelector(this.buildAndEmitCallback.selector, blockHash, keccak256(builderBid));
	}

	function submitToRelay(bytes memory builderBid) internal view {
		(bool success, bytes memory data) = Suave.SUBMIT_ETH_BLOCK_TO_RELAY
			.staticcall(abi.encode(boostRelayUrl, builderBid));
		if (!success) {
			revert SuaveErrorWithData(string(data), builderBid);
		}
	}

	function storeBuilderBid(Suave.DataId blockBidId, bytes memory builderBid) internal {
		address[] memory peekers = new address[](1);
		peekers[0] = address(this);
		Suave.confidentialStore(blockBidId, BB_NAMESPACE, builderBid);
	}

	// Extract block-hash from stringified SubmitBlockRequest JSON object - method will fail if the struct changes!
	// todo: extract the hash via solady: builderBidParsed.at('"message"').at('"block_hash"').value()
	function extractBlockHash(bytes memory builderBid, uint slot) public pure returns (string memory) {
		uint resultBytesLen = 64;
		uint offset = 121 + decLen(slot);
		bytes memory result = new bytes(resultBytesLen);
		assembly {
			for { let i:=32 } lt(i, add(resultBytesLen, 32)) { i:=add(i, 32) } {
				mstore(add(result, i), mload(add(builderBid, add(offset, i))))
			}
		}
		return string(result);
	}

	function decLen(uint num) internal pure returns (uint count) {
		assembly {
			for { let dec := 10 } true { dec := mul(dec, 10) } {
				count := add(count, 1)
				switch lt(num, dec)
					case 1 { break }
			}
		}
	}
}