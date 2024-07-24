import { useSyncExternalStore } from 'react'

export function useIsServer() {
	return useSyncExternalStore(
		() => () => {},
		() => false,
		() => true
	)
}
