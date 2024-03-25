import { describe, expect, it } from 'vitest'
import { calculateLayout } from './calculateLayout'

describe('ConstrainedGrid', () => {
	it('should return 1 row 1 col if count is 1', () => {
		const result = calculateLayout({
			count: 1,
			height: 100,
			width: 100,
		})
		expect(result.cols).toEqual(1)
		expect(result.rows).toEqual(1)
	})

	it('should return 2 row 1 col if count is 2 and height is 2x width', () => {
		const result = calculateLayout({
			count: 2,
			height: 200,
			width: 100,
		})
		expect(result.cols).toEqual(1)
		expect(result.rows).toEqual(2)
	})

	it('should return 2 row 2 col if count is 4 and height and width are equal', () => {
		const result = calculateLayout({
			count: 4,
			height: 200,
			width: 200,
		})
		expect(result.cols).toEqual(2)
		expect(result.rows).toEqual(2)
	})

	it('should return 2 row 2 col if count is 4 and height and width are equal', () => {
		const result = calculateLayout({
			count: 3,
			height: 200,
			width: 200,
		})
		expect(result.cols).toEqual(2)
		expect(result.rows).toEqual(2)
	})

	it('should return 4 row 1 col if count is 4 and height is 4x width', () => {
		const result = calculateLayout({
			count: 4,
			height: 400,
			width: 100,
		})
		expect(result.cols).toEqual(1)
		expect(result.rows).toEqual(4)
	})

	it('should return 2 row 2 col if count is 4 and height is 1.333x width', () => {
		const result = calculateLayout({
			count: 4,
			height: 400,
			width: 399,
		})
		expect(result.cols).toEqual(2)
		expect(result.rows).toEqual(2)
	})
})
