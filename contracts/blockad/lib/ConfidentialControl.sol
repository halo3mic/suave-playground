// SPDX-License-Identifier: MIT
// Author: Miha Lotric (halo3mic)

pragma solidity ^0.8.8;

import { SuaveContract, Suave } from "./SuaveContract.sol";


abstract contract ConfidentialControl is SuaveContract {
	struct UnlockArgs {
		bytes32 key;
		bytes32 nextHash;
	}

	modifier unlock(UnlockArgs calldata unlockPair) {
		crequire(isValidKey(unlockPair.key), "Invalid key");
		_;
		presentHash = unlockPair.nextHash;
		nonce++;
	}

	string internal constant S_NAMESPACE = "blockad:v0:secret";
	Suave.DataId internal secretBidId;
	bytes32 internal presentHash;
	uint internal nonce;

	/**********************************************************************
	 *                           ⛓️ ON-CHAIN METHODS                       *
	 ***********************************************************************/

	function ccCallback(bytes32 nextHash, Suave.DataId sBidId) external {
		crequire(!isInitialized(), "Already initialized");
		presentHash = nextHash;
		secretBidId = sBidId;
	}

	function isInitialized() public view returns (bool) {
		return presentHash != 0;
	}

	/**********************************************************************
	 *                         🔒 CONFIDENTIAL METHODS                      *
	 ***********************************************************************/

	function confidentialConstructor() public virtual onlyConfidential returns (bytes memory) {
		crequire(!isInitialized(), "Already initialized");
		bytes memory secret = Suave.confidentialInputs();
		Suave.DataId sBidId = storeSecret(secret);
		bytes32 nextHash = makeHash(abi.decode(secret, (bytes32)), nonce);
		return abi.encodeWithSelector(this.ccCallback.selector, nextHash, sBidId);
	}

	/**********************************************************************
	 *                         🛠️ INTERNAL METHODS                          *
	 ***********************************************************************/

	function storeSecret(bytes memory secret) internal returns (Suave.DataId) {
		address[] memory peekers = new address[](3);
		peekers[0] = address(this);
		peekers[1] = Suave.FETCH_DATA_RECORDS;
		peekers[2] = Suave.CONFIDENTIAL_RETRIEVE;
		Suave.DataRecord memory secretBid = Suave.newDataRecord(0, peekers, peekers, S_NAMESPACE);
		Suave.confidentialStore(secretBid.id, S_NAMESPACE, secret);
		return secretBid.id;
	}

	function isValidKey(bytes32 key) internal view returns (bool) {
		return keccak256(abi.encode(key)) == presentHash;
	}

	function getUnlockPair() internal returns (UnlockArgs memory) {
		return UnlockArgs(getKey(nonce), getHash(nonce + 1));
	}

	function getHash(uint _nonce) internal returns (bytes32) {
		return keccak256(abi.encode(getKey(_nonce)));
	}

	function getKey(uint _nonce) internal returns (bytes32) {
		return makeKey(getSecret(), _nonce);
	}

	function makeHash(bytes32 secret, uint _nonce) internal pure returns (bytes32) {
		return keccak256(abi.encode(makeKey(secret, _nonce)));
	}

	function makeKey(bytes32 secret, uint _nonce) internal pure returns (bytes32) {
		return keccak256(abi.encode(secret, _nonce));
	}

	function getSecret() internal returns (bytes32) {
		bytes memory secretB = Suave.confidentialRetrieve(secretBidId, S_NAMESPACE);
		return abi.decode(secretB, (bytes32));
	}
}
