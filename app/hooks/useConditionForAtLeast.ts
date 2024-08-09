import { useEffect, useState } from 'react'

export function useConditionForAtLeast(condition: boolean, time: number) {
	const [value, setValue] = useState(condition)

	useEffect(() => {
		const timeout = window.setTimeout(() => {
			setValue(condition)
		}, time)
		return () => {
			clearTimeout(timeout)
		}
	}, [condition, time])

	return value
}
