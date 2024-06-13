import { useEffect } from 'react'
import { createGlobalState } from 'react-use'

const useMediaDevicesState = createGlobalState<MediaDeviceInfo[]>([])

export default function useMediaDevices(
	filter: (device: MediaDeviceInfo) => boolean = () => true
) {
	const [devices, setDevices] = useMediaDevicesState()

	useEffect(() => {
		let mounted = true
		const requestDevices = () => {
			navigator.mediaDevices.enumerateDevices().then((d) => {
				if (mounted) setDevices(d)
			})
		}
		navigator.mediaDevices.addEventListener('devicechange', requestDevices)
		requestDevices()
		return () => {
			mounted = false
			navigator.mediaDevices.removeEventListener('devicechange', requestDevices)
		}
	}, [setDevices])

	return devices.filter(filter)
}
