// SPDX-License-Identifier: MIT
// Author: Miha Lotric (halo3mic)

pragma solidity ^0.8.8;

import { Suave } from "../../standard_peekers/bids.sol";


abstract contract SuaveContract {
    error SuaveError(string message);

	modifier onlyConfidential() {
		crequire(Suave.isConfidential(), "Not confidential");
		_;
	}

	function simulateBundleSafe(bytes memory bundle) internal view returns (bool, uint64) {
        (bool success, bytes memory egp) = Suave.SIMULATE_BUNDLE.staticcall(abi.encode(bundle));
        return (success, abi.decode(egp, (uint64)));
	}

    function crequire(bool condition, string memory message) internal pure {
        if (!condition)
            revert SuaveError(message);
    }

}