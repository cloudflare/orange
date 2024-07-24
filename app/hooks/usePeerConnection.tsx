import { useEffect, useMemo, useState } from 'react'
import { RxjsPeer, type PeerConfig } from '~/utils/rxjs/RxjsPeer.client'
import { useSubscribedState } from './rxjsHooks'
import { useStablePojo } from './useStablePojo'

export const usePeerConnection = (config: PeerConfig) => {
	const stableConfig = useStablePojo(config)
	const peer = useMemo(() => new RxjsPeer(stableConfig), [stableConfig])
	const peerConnection = useSubscribedState(peer.peerConnection$)

	const [iceConnectionState, setIceConnectionState] =
		useState<RTCIceConnectionState>('new')

	useEffect(() => {
		if (!peerConnection) return
		setIceConnectionState(peerConnection.iceConnectionState)
		const iceConnectionStateChangeHandler = () => {
			setIceConnectionState(peerConnection.iceConnectionState)
		}
		peerConnection.addEventListener(
			'iceconnectionstatechange',
			iceConnectionStateChangeHandler
		)
		return () => {
			peerConnection.removeEventListener(
				'connectionstatechange',
				iceConnectionStateChangeHandler
			)
		}
	}, [peerConnection])

	return {
		peer,
		iceConnectionState,
	}
}
