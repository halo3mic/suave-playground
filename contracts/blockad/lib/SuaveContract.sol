// SPDX-License-Identifier: MIT
// Author: Miha Lotric (halo3mic)

pragma solidity ^0.8.8;

import { Suave } from "../../standard_peekers/bids.sol";


abstract contract SuaveContract {
	error SuaveError(string message);
	error SuaveErrorWithData(string message, bytes data);

	modifier onlyConfidential() {
		crequire(Suave.isConfidential(), "Not confidential");
		_;
	}

	function simulateBundleSafe(bytes memory bundle, bool doRevert) internal view returns (bool valid, uint64 egp) {
		(bool success, bytes memory d) = Suave.SIMULATE_BUNDLE.staticcall{ gas: 20_000 }(abi.encode(bundle));
		crequire(!doRevert || success, string(d));
		if (success) {
			return (true, abi.decode(d, (uint64)));
		}
	}

	function crequire(bool condition, string memory message) internal pure {
		if (!condition) {
			revert SuaveError(message);
		}
	}
}
