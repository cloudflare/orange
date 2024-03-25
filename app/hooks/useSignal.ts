import { useEffect, useMemo } from 'react'
import Signal from '~/utils/Signal'

export default function useSignal(roomName: string) {
	const signal = useMemo(() => new Signal(roomName), [roomName])

	useEffect(() => {
		signal.addEventListener('error', console.error)
		signal.addEventListener('connected', () =>
			console.debug(`connected to ${roomName}`)
		)
		signal.connect()
		return () => {
			signal.dispose()
		}
	}, [roomName, signal])

	useEffect(() => {
		return () => {
			signal.dispose()
		}
	}, [signal])

	return { signal }
}
