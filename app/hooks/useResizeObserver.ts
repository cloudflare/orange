import type { RefObject } from 'react'
import { useEffect, useState } from 'react'

export function useResizeObserver<El extends HTMLElement>(ref: RefObject<El>) {
	const [entry, setEntry] = useState<Omit<ResizeObserverEntry, 'target'>>()

	useEffect(() => {
		const observer = new ResizeObserver(([e]) => {
			setEntry(e)
		})
		const { current } = ref
		if (!current) {
			return
		}

		observer.observe(current)
		return () => {
			observer.disconnect()
		}
	}, [ref])

	return entry
}
