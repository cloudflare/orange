import { useSyncExternalStore } from 'react'
import { mode } from '~/utils/mode'

function getSnapshot() {
	// we disable this in dev to make it easier to simulate
	// ice disconnection by turning off wifi without causing
	// the entire meeting room to unmount
	return mode === 'development' ? true : navigator.onLine
}

function getServerSnapshot() {
	return true
}

function subscribe(callback: () => void) {
	window.addEventListener('online', callback)
	window.addEventListener('offline', callback)
	return () => {
		window.removeEventListener('online', callback)
		window.removeEventListener('offline', callback)
	}
}

export function useIsOnline() {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
