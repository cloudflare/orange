import { useMemo } from 'react'
import { getPacketLossStats$ } from '~/utils/rxjs/getPacketLossStats$'
import type { RxjsPeer } from '~/utils/rxjs/RxjsPeer.client'
import { useSubscribedState } from './rxjsHooks'

export function useConnectionStats(peer: RxjsPeer) {
	const stats$ = useMemo(
		() => getPacketLossStats$(peer.peerConnection$),
		[peer.peerConnection$]
	)
	const stats = useSubscribedState(stats$, {
		inboundPacketLossPercentage: 0,
		outboundPacketLossPercentage: 0,
	})

	return stats
}
