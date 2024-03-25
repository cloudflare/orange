import { describe, expect, it } from 'vitest'
import { resolveRoster } from './useStageManager'

const a = { id: 'a' }
const b = { id: 'b' }
const c = { id: 'c' }
const d = { id: 'd' }

describe('resolveRoster', () => {
	it('should return the stable list in the same order even if roster is out of order', () => {
		const stableList = [a, b, c, d]
		const result = resolveRoster(stableList, [b, c, a, d])
		expect(result).toEqual(stableList)
	})

	it('should replace items in the stable list with items in the roster not present in the stable list', () => {
		const stableList = [a, b, c]
		const result = resolveRoster(stableList, [c, a, d])
		expect(result).toEqual([a, d, c])
	})

	it(`should append items in the roster that aren't in the stable list`, () => {
		const stableList = [a, c]
		const roster = [a, b, c, d]
		const result = resolveRoster(stableList, roster)
		expect(result).toEqual([a, c, b, d])
	})

	it(`should drop items in the stable list that aren't in the roster`, () => {
		const stableList = [a, b, c, d]
		const roster = [a, b, c]
		const result = resolveRoster(stableList, roster)
		expect(result).toEqual(roster)
	})

	it(`should populate a list if the current roster is empty`, () => {
		const stableList = [] as { id: string }[]
		const roster = [a, b, c]
		const result = resolveRoster(stableList, roster)
		expect(result).toEqual(roster)
	})

	it(`should populate the list with items from the new roster array`, () => {
		const stableList = [a, b, c]
		const roster = [a, b, { ...c, foo: true }]
		const result = resolveRoster<{ id: string; foo?: boolean }>(
			stableList,
			roster
		)
		expect(result[2].foo).toBeTruthy()
	})
})
