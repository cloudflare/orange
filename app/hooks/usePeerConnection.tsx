import { useEffect, useState } from 'react'
import type { PeerDebugInfo } from '~/utils/Peer.client'
import Peer from '~/utils/Peer.client'
import { useConditionForAtLeast } from './useConditionForAtLeast'

export const usePeerConnection = () => {
	const [peer, setPeer] = useState<Peer | null>(null)
	const [peerId, setPeerId] = useState(Math.random())
	const [debugInfo, setDebugInfo] = useState<PeerDebugInfo>()
	const [iceConnectionState, setIceConnectionState] =
		useState<RTCIceConnectionState>('new')

	useEffect(() => {
		const p = new Peer()
		setPeer(p)
		const debugHandler = () => {
			setDebugInfo(p.getDebugInfo())
		}
		const iceConnectionStateChangeHandler = () => {
			setIceConnectionState(p.pc.iceConnectionState)
		}
		p.pc.addEventListener(
			'iceconnectionstatechange',
			iceConnectionStateChangeHandler
		)
		p.history.addEventListener('logentry', debugHandler)
		return () => {
			p.history.removeEventListener('logentry', debugHandler)
			p.pc.removeEventListener(
				'connectionstatechange',
				iceConnectionStateChangeHandler
			)
			p.destroy()
		}
	}, [peerId])

	const disconnectedAtLeastFiveSeconds = useConditionForAtLeast(
		iceConnectionState === 'disconnected',
		5000
	)

	const shouldReconnect =
		(disconnectedAtLeastFiveSeconds && iceConnectionState === 'disconnected') ||
		iceConnectionState === 'failed'

	useEffect(() => {
		if (shouldReconnect) {
			setPeerId(Math.random())
			const i = setInterval(() => {
				setPeerId(Math.random())
			}, 10e3)

			return () => {
				clearInterval(i)
			}
		}
	}, [shouldReconnect])

	return { peer, debugInfo, iceConnectionState }
}
