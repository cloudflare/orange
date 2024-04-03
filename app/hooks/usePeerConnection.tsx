import { useEffect, useState } from 'react'
import type { PeerDebugInfo } from '~/utils/Peer.client'
import Peer from '~/utils/Peer.client'

export const usePeerConnection = (apiExtraParams?: string) => {
	const [peer, setPeer] = useState<Peer | null>(null)
	const [debugInfo, setDebugInfo] = useState<PeerDebugInfo>()
	const [iceConnectionState, setIceConnectionState] =
		useState<RTCIceConnectionState>('new')

	useEffect(() => {
		const p = new Peer({ apiExtraParams })
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
	}, [apiExtraParams])

	return { peer, debugInfo, iceConnectionState }
}
