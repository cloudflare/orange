import { useEffect, useState } from 'react'
import keepTrying from '~/utils/keepTrying'
import type Peer from '~/utils/Peer.client'

export default function usePushedTrack(
	peer: Peer | null,
	mediaStreamTrack?: MediaStreamTrack
) {
	const [transceiverId, setTransceiverId] = useState<string>()
	const [pending, setPending] = useState(false)

	const sessionId = peer?.sessionId

	useEffect(() => {
		if (pending || !sessionId || !mediaStreamTrack) return
		// important that we don't call pushTrack more
		// than once here so we'll set state. If the media
		// stream changes while this is pending we'll replace
		// it once it is done
		if (
			// track hasn't been pushed at all
			transceiverId === undefined ||
			// this means the peer changed and we need to push a new track
			!transceiverId.startsWith(sessionId)
		) {
			setPending(true)
			keepTrying(() =>
				peer
					.pushTrack(mediaStreamTrack.id, mediaStreamTrack)
					.then((trackObject) => {
						// backwards compatibility: trackObject -> ResourceID
						let resourceID = `${trackObject.sessionId}/${trackObject.trackName}`
						setTransceiverId(resourceID)
						setPending(false)
					})
			)
		} else {
			peer.replaceTrack(transceiverId, mediaStreamTrack)
		}
	}, [mediaStreamTrack, peer, pending, sessionId, transceiverId])

	return transceiverId
}
