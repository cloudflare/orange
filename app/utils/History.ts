export class History<T> extends EventTarget {
	entries: T[] = []
	private limit: number

	constructor(limit: number = Infinity) {
		super()
		this.limit = Math.max(1, limit) // Ensure the limit is at least 1
	}

	addEventListener(
		type: 'logentry',
		callback:
			| { handleEvent: (event: Event & { entry: T }) => void }
			| ((event: Event & { entry: T }) => void)
			| null,
		options?: boolean | AddEventListenerOptions | undefined
	): void {
		return super.addEventListener(type, callback as any, options)
	}

	removeEventListener(
		type: 'logentry',
		callback:
			| { handleEvent: (event: Event & { entry: T }) => void }
			| ((event: Event & { entry: T }) => void)
			| null,
		options?: boolean | AddEventListenerOptions | undefined
	): void {
		return super.removeEventListener(type, callback as any, options)
	}

	log(entry: T) {
		if (this.entries.length >= this.limit) {
			this.entries.shift() // Remove the oldest entry
		}
		this.entries.push(entry)
		this.dispatchEvent(new CustomEvent('logentry'))
	}
}
