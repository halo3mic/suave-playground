import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { parseHexArg } from '../src/utils'


describe('parseHexArg', () => {

	it('parse numbers', () => {
		checkExpectations([
			[ 1, '0x01' ],
			[ 42, '0x2a' ],
			[ 0, '0x' ],
			[ 2.324, '0x02'],
		])
	})

	it('parse bigints', () => {
		checkExpectations([
			[ BigInt(0), '0x' ],
			[ BigInt(123), '0x7b' ],
			[ BigInt('0x446c3b15f9926687d2c40534fdb564000000000000'), '0x446c3b15f9926687d2c40534fdb564000000000000' ],
		])
	})

	it('parse BN', () => {
		checkExpectations([
			[ BigNumber.from(1), '0x01' ],
			[ BigNumber.from(42), '0x2a' ],
			[ BigNumber.from(0), '0x' ],
		])
	})

	it('parse strings', () => {
		checkExpectations([
			[ '0x01', '0x01' ],
			[ '0x2a', '0x2a' ],
			[ '0x', '0x' ],
			[ '', '0x' ],
		])
	})

    
	it('parse null', () => {
		checkExpectations([
			[ null, '0x' ],
		])
	})
    
	it('parse invalid strings', () => {
		expect(() => parseHexArg('0xzz')).to.throw()
		expect(() => parseHexArg('2133')).to.throw()
		expect(() => parseHexArg('x2h33')).to.throw()
	})

	function checkExpectations(inputToExpected) {
		for (const [input, expected] of inputToExpected) {
			const actual = parseHexArg(input)
			expect(actual).to.eq(expected)
		}
	}


})