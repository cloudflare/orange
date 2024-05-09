import { useEffect, useState } from 'react'
import type { PeerDebugInfo } from '~/utils/Peer.client'
import Peer from '~/utils/Peer.client'
import { useStablePojo } from './useStablePojo'

export const usePeerConnection = (config: {
	apiExtraParams?: string
	iceServers?: RTCIceServer[]
}) => {
	const [peer, setPeer] = useState<Peer | null>(null)
	const [debugInfo, setDebugInfo] = useState<PeerDebugInfo>()
	const [iceConnectionState, setIceConnectionState] =
		useState<RTCIceConnectionState>('new')

	const stableConfig = useStablePojo(config)

	useEffect(() => {
		const p = new Peer(stableConfig)
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
	}, [stableConfig])

	return { peer, debugInfo, iceConnectionState }
}
