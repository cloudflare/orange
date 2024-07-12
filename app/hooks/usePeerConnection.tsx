import { useEffect, useMemo, useState } from 'react'
import type { PeerDebugInfo } from '~/utils/Peer.client'
import { RxjsPeer, type PeerConfig } from '~/utils/rxjs/RxjsPeer.client'
import { useSubscribedState } from './rxjsHooks'
import { useStablePojo } from './useStablePojo'

export const usePeerConnection = (config: PeerConfig) => {
	const stableConfig = useStablePojo(config)
	const peer = useMemo(() => new RxjsPeer(stableConfig), [stableConfig])
	const peerConnection = useSubscribedState(peer.peerConnection$)

	const [debugInfo, _setDebugInfo] = useState<PeerDebugInfo>()
	const [iceConnectionState, setIceConnectionState] =
		useState<RTCIceConnectionState>('new')

	useEffect(() => {
		if (!peerConnection) return
		setIceConnectionState(peerConnection.iceConnectionState)
		// const debugHandler = () => {
		// 	setDebugInfo(p.getDebugInfo())
		// }
		const iceConnectionStateChangeHandler = () => {
			setIceConnectionState(peerConnection.iceConnectionState)
		}
		peerConnection.addEventListener(
			'iceconnectionstatechange',
			iceConnectionStateChangeHandler
		)
		// p.history.addEventListener('logentry', debugHandler)
		return () => {
			// p.history.removeEventListener('logentry', debugHandler)
			peerConnection.removeEventListener(
				'connectionstatechange',
				iceConnectionStateChangeHandler
			)
			// p.destroy()
		}
	}, [peerConnection])

	return { peer, debugInfo, iceConnectionState }
}
