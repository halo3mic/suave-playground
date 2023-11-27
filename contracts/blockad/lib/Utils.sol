// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;


library DynamicUintArray {

	function append(bytes memory a, uint e) internal pure returns (bytes memory) {
		return bytes.concat(a, TypeConversion.toBytes(e));
	}

	function export(bytes memory a) internal pure returns (uint[] memory) {
		return TypeConversion.toUints(a);
	}

}

library TypeConversion {

	function toBytes(uint x) internal pure returns (bytes memory y) {
		y = new bytes(32);
		assembly { mstore(add(y, 32), x) }
	}

	function toUint(bytes memory x, uint offset) internal pure returns (uint y) {
		assembly { y := mload(add(x, offset)) }
	}

	function toUints(bytes memory xs) internal pure returns (uint[] memory ys) {
		ys = new uint[](xs.length/32);
        for (uint i=0; i < xs.length/32; i++)
            ys[i] = toUint(xs, i*32 + 32);
    }

}

