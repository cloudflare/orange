import { useCallback, useEffect, useRef, useState } from 'react'

export default function useCopyToClipboard(delay = 2000) {
	const [copied, setCopied] = useState(false)
	const timeoutRef = useRef(-1)

	const copy = useCallback(
		(value: string) => {
			navigator.clipboard.writeText(value)
			setCopied(true)
			clearTimeout(timeoutRef.current)
			timeoutRef.current = window.setTimeout(() => {
				setCopied(false)
			}, delay)
		},
		[delay]
	)

	useEffect(() => {
		return () => {
			clearTimeout(timeoutRef.current)
		}
	}, [])

	return [copied, copy] as const
}
