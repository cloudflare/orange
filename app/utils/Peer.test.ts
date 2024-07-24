/* eslint-disable no-loop-func */
import { expect, test } from 'vitest'
import { BulkRequestDispatcher, FIFOScheduler } from './Peer.utils'

test('schedule', async () => {
	let scheduler = new FIFOScheduler()
	let list: number[] = []
	scheduler.schedule(async () => {
		list.push(1)
	})
	scheduler.schedule(async () => {
		await new Promise((r) => setTimeout(r, 500))
		list.push(2)
	})
	await scheduler.schedule(async () => {
		list.push(3)
	})
	expect(list).toStrictEqual([1, 2, 3])
})

test('taskError', async () => {
	const err1 = 'error'
	const ok = 'ok'
	let scheduler = new FIFOScheduler()

	let p1 = scheduler.schedule(async () => {
		throw new Error(err1)
	})
	let p2 = scheduler.schedule(async () => {
		return ok
	})
	try {
		await p1
	} catch (error: any) {
		expect(error.message).eq(err1)
	}
	expect(await p2).eq(ok)
})

test('bulkRequest', async () => {
	let dispatcher: BulkRequestDispatcher<number, void> =
		new BulkRequestDispatcher()

	let requestSent = false
	for (let i = 0; i < 4; i++) {
		dispatcher.doBulkRequest(i, async (bulkCopy: number[]) => {
			expect(bulkCopy).toStrictEqual([0, 1, 2, 3])
			requestSent = true
		})
	}
	expect(requestSent).eq(false)
	// just waits for a macrotask after the bulk request
	await new Promise((r) => setTimeout(r, 100))
	expect(requestSent).eq(true)
})

test('bulkRequestWithLimit', async () => {
	let dispatcher: BulkRequestDispatcher<number, void> =
		new BulkRequestDispatcher(2)

	let requests = 0
	for (let i = 0; i < 2; i++) {
		dispatcher.doBulkRequest(i, async (bulkCopy: number[]) => {
			expect(bulkCopy).toStrictEqual([0, 1])
			requests++
		})
	}
	for (let i = 2; i < 4; i++) {
		dispatcher.doBulkRequest(i, async (bulkCopy: number[]) => {
			expect(bulkCopy).toStrictEqual([2, 3])
			requests++
		})
	}
	expect(requests).eq(0)
	// just waits for a macrotask after the bulk request
	await new Promise((r) => setTimeout(r, 100))
	expect(requests).eq(2)
})

test('bulkRequestBatchCopy', async () => {
	// test goal: bulkCopy shoud have only the items accumulated until the bulk request is started
	let dispatcher: BulkRequestDispatcher<number, void> =
		new BulkRequestDispatcher()

	let requestSent = false
	for (let i = 0; i < 2; i++) {
		dispatcher.doBulkRequest(i, async (bulkCopy: number[]) => {
			// third enqueued macrotask: we delay the request execution to run first
			// doBulkRequest(42, ..)
			setTimeout(() => {
				expect(bulkCopy).toStrictEqual([0, 1])
				requestSent = true
			}, 0)
		})
	}
	expect(requestSent).eq(false)
	// second enqueued macrotask
	setTimeout(() => {
		expect(requestSent).eq(false)
		// this is the ultimate test: bulkCopy of the first request shoudn't include 42
		dispatcher.doBulkRequest(42, async (_bulkCopy: number[]) => {})
	}, 0)
	// wait for the completion
	await new Promise((r) => setTimeout(r, 100))
	expect(requestSent).eq(true)
})
