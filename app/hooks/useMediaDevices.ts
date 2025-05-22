import { useEffect } from 'react'
import { createGlobalState } from 'react-use'

const useMediaDevicesState = createGlobalState<MediaDeviceInfo[]>([])

export default function useMediaDevices(
	filter: (device: MediaDeviceInfo) => boolean = () => true
) {
	const [devices, setDevices] = useMediaDevicesState()
	const filterSource = filter.toString()

	useEffect(() => {
		let mounted = true
		const requestDevices = () => {
			navigator.mediaDevices.enumerateDevices().then((d) => {
				console.log(`enumerateDevices with filter fn: ${filterSource} `, d)
				if (mounted) setDevices(d)
			})
		}
		navigator.mediaDevices.addEventListener('devicechange', requestDevices)
		requestDevices()
		return () => {
			mounted = false
			navigator.mediaDevices.removeEventListener('devicechange', requestDevices)
		}
	}, [filterSource, setDevices])

	return devices.filter(filter)
}
