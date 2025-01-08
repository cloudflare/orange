import { useObservableAsValue } from 'partytracks/react'
import { useEffect, useRef, useState } from 'react'
import type { DeadTrackInfo } from '~/routes/api.deadTrack'
import populateTraceLink from '~/utils/populateTraceLink'
import { useRoomContext } from './useRoomContext'

export function useDeadPulledTrackMonitor(
	trackInfo?: string,
	sessionId?: string,
	enabled?: boolean,
	track?: MediaStreamTrack,
	name?: string
) {
	const [deadTrack, setDeadTrack] = useState(false)
	const { partyTracks, traceLink, room, feedbackEnabled } = useRoomContext()
	const peerConnection = useObservableAsValue(partyTracks.peerConnection$)
	const timeoutRef = useRef(-1)

	useEffect(() => {
		if (!peerConnection || !track || !enabled || deadTrack || !feedbackEnabled)
			return
		timeoutRef.current = window.setTimeout(() => {
			peerConnection.getStats(track).then((report) => {
				// this means component has unmounted
				if (timeoutRef.current === -1) return
				const stat = [...report.values()].find(
					(s) => s.trackIdentifier === track.id
				)
				if (stat?.bytesReceived === 0) {
					setDeadTrack(true)
				}
			})
		}, 10000)

		return () => {
			clearTimeout(timeoutRef.current)
			// reset this to -1 for the check above
			timeoutRef.current = -1
		}
	}, [deadTrack, enabled, feedbackEnabled, partyTracks, peerConnection, track])

	useEffect(() => {
		if (!sessionId || !deadTrack || !feedbackEnabled) return
		const pullSessionTrace = populateTraceLink(sessionId, traceLink)
		const [pushedSessionId, trackId] = trackInfo?.split('/') ?? []
		const pushedSessionTrace = populateTraceLink(pushedSessionId, traceLink)

		if (pushedSessionTrace && pullSessionTrace) {
			const info: DeadTrackInfo = {
				pullSessionTrace,
				pushedSessionTrace,
				trackId,
				pullingUser: room.identity?.name,
				pushingUser: name,
			}
			fetch('/api/deadTrack', {
				method: 'POST',
				body: JSON.stringify(info),
			})
		}
	}, [
		deadTrack,
		peerConnection,
		feedbackEnabled,
		name,
		sessionId,
		room.identity?.name,
		traceLink,
		trackInfo,
	])
}
