import { useEffect } from 'react'
import { createGlobalState, useLocalStorage } from 'react-use'

/**
 * Unfortunately the useLocalStorage hook from react-use does not
 * keep the values in sync if the same key is used in multiple places.
 * We can fix this by combining useLocalStorage with createGlobalState.
 */
function createGlobalPersistedState<T>(key: string, defaultValue: T) {
	const useGlobalState = createGlobalState<T>(defaultValue)
	return () => {
		const [globalState, setGlobalState] = useGlobalState()
		const [localStorageState, setLocalStorageState] = useLocalStorage<T>(key)

		useEffect(() => {
			setLocalStorageState(globalState)
		}, [globalState, setLocalStorageState])

		return [localStorageState, setGlobalState] as const
	}
}

export const useVideoInputDeviceId = createGlobalPersistedState<
	string | undefined
>('videoinput-device-id', undefined)
export const useVideoInputDeviceLabel = createGlobalPersistedState<
	string | undefined
>('videoinput-device-label', undefined)
export const useAudioInputDeviceId = createGlobalPersistedState<
	string | undefined
>('audioinput-device-id', undefined)
export const useAudioInputDeviceLabel = createGlobalPersistedState<
	string | undefined
>('audioinput-device-label', undefined)
export const useAudioOutputDeviceId = createGlobalPersistedState<
	string | undefined
>('audiooutput-device-id', undefined)
