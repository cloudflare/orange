import { useMemo } from 'react'

/**
 * Useful utility for getting a stable reference to a POJO
 * that might be created on every new render.
 */
export function useStablePojo<T>(value: T): T {
	const jsonString = JSON.stringify(value)
	return useMemo(() => JSON.parse(jsonString), [jsonString])
}
