import { ethers, BigNumberish } from 'ethers'
import fs from 'fs'
import path from 'path'


export function keccak256(x: string): string {
	return hexFill32(ethers.utils.keccak256(x))
}

export function parseHexArg(arg: null | BigNumberish): string {
	if (!arg) { // 0, null, undefined, ''
		return '0x'
	}
  
	if (typeof arg === 'object' && 'toHexString' in arg) {
		arg = arg.toHexString()
	}
  
	switch (typeof arg) {
		case 'number':
		case 'bigint':
			return intToHex(arg)
		case 'string':
			if (ethers.utils.isHexString(arg)) {
				return arg == '0x00' ? '0x' : hexFillEven(arg)
			} else {
				throw new Error(`Invalid hex string: ${arg}`)
			}
		default:
			return '0x'
		}
}

export function getEnvValSafe(key: string): string {
	const endpoint = process.env[key]
	if (!endpoint)
		throw(`Missing env var ${key}`)
	return endpoint
}

export function fetchAbis(): Record<string, string> {
	const abis = {}

	const fetchAbisFromDir = (dir: string) => {
		fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
			const fullPath = path.join(dir, dirent.name)
			if (dirent.isDirectory()) {
				fetchAbisFromDir(fullPath)
			} else if (dirent.isFile() && dirent.name.endsWith('.json')) {
				const name: string = dirent.name.split('.')[0]
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const abi: string = require(fullPath)
				abis[name] = abi
			}
		})
	}

	const abiDir: string = path.join(__dirname, '../abi')
	fetchAbisFromDir(abiDir)
    
	return abis
}

export function intToHex(intVal: number | bigint): string {
	let hex = intVal.toString(16)
	hex = hex.split('.')[0]
	if (hex === '0') {
		return '0x'
	}
	if (hex.length % 2) {
		hex = '0' + hex
	}
	return '0x' + hex
}

export function hexFill32(hex: string): string {
	return '0x' + hex.slice(2).padStart(64, '0')
}

export function hexFillEven(hex: string): string {
	return hex.length % 2 ? '0x0' + hex.slice(2) : hex
}

export function removeLeadingZeros(hex: string): string {
	return '0x' + hex.slice(2).replace(/^00+/, '')
}