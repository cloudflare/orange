import { useEffect, useState } from 'react'
import Toast, { Root } from '~/components/Toast'
import { useRoomContext } from '../hooks/useRoomContext'
import { Icon } from './Icon/Icon'

export function IceConnectionStateToast() {
	const { iceConnectionState } = useRoomContext()

	const [onceConnected, setOnceConnected] = useState(false)

	useEffect(() => {
		if (iceConnectionState === 'connected' && !onceConnected) {
			setOnceConnected(true)
		}
	}, [iceConnectionState, onceConnected])

	if (iceConnectionState === 'connected') return null

	return (
		<Root duration={Infinity}>
			<div className="space-y-2 text-sm">
				<Toast.Title className="flex items-center gap-2 font-bold">
					<Icon type="SignalIcon" />
					{onceConnected ? 'Reconnecting...' : 'Connecting...'}
				</Toast.Title>
				<Toast.Description className="text-gray-500 dark:text-gray-300">
					ICE Connection state: {iceConnectionState}
				</Toast.Description>
			</div>
		</Root>
	)
}
