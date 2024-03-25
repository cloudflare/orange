export class History<T> extends EventTarget {
	entries: T[] = []

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
		this.entries.push(entry)
		this.dispatchEvent(new CustomEvent('logentry'))
	}
}
