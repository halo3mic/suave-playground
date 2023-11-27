// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

library UintBytes {

	function append(bytes memory a, uint e) internal pure returns (bytes memory) {
		return bytes.concat(a, toBytes(e));
	}
	
	function export(bytes memory xs) internal pure returns (uint[] memory) {
		return toUints(xs);
	}

	function toBytes(uint x) internal pure returns (bytes memory y) {
        return abi.encode(x);
    }

	function toUints(bytes memory xs) internal pure returns (uint[] memory ys) {
		return abi.decode(xs, (uint[]));
    }

	function toUint(bytes memory x) internal pure returns (uint y) {
        return abi.decode(x, (uint));
    }

}

// todo: do we care about being efficient?
// library DynamicBytesUintArray {

// 	function append(bytes memory a, uint e) internal pure returns (bytes memory) {
// 		return bytes.concat(a, uintToBytes(e));
// 	}

// 	function export(bytes memory a) internal pure returns (uint[] memory) {
// 		return bytesToUints(a);
// 	}

// 	function uintToBytes(uint x) internal pure returns (bytes memory y) {
//         assembly { mstore(add(y, 32), x) }
//     }

// 	function bytesToUints(bytes memory xs) internal pure returns (uint[] memory ys) {
// 		assembly {
// 			let ysLength := div(mload(xs), 32)
// 			for { let i := 0 } lt(i, ysLength) { i := add(i, 1) } {
// 	            let wordPos := add(xs, add(mul(i, 32), 32))
//             	let word := mload(wordPos)
// 				let yStart := add(ys, 32)
//             	mstore(add(yStart, mul(i, 32)), word)
// 			}
// 		}
//     }

// 	function bytesToUint(bytes memory x, uint offset) internal pure returns (uint y) {
//         assembly { y := mload(add(x, offset)) }
//     }

// }