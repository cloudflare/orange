import { useEffect, useState } from 'react'
import type { PeerDebugInfo } from '~/utils/Peer.client'
import Peer from '~/utils/Peer.client'

export const usePeerConnection = () => {
	const [peer, setPeer] = useState<Peer | null>(null)
	const [debugInfo, setDebugInfo] = useState<PeerDebugInfo>()

	useEffect(() => {
		const p = new Peer()
		setPeer(p)
		const handler = () => {
			setDebugInfo(p.getDebugInfo())
		}
		p.history.addEventListener('logentry', handler)
		return () => {
			p.history.removeEventListener('logentry', handler)
		}
	}, [])

	return { peer, debugInfo }
}
