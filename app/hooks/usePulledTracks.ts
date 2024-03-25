import { useEffect, useRef, useState } from 'react'
import { useUnmount } from 'react-use'
import type Peer from '~/utils/Peer.client'
import { useRoomContext } from './useRoomContext'

function pullTrack(peer: Peer, track: string) {
	const [sessionId, trackName] = track.split('/')
	return peer.pullTrack({
		location: 'remote',
		sessionId,
		trackName,
	})
}

export default function usePulledTracks(
	tracksToPull: string[]
): Record<string, MediaStreamTrack> {
	// using useState here because we want React to re-render here
	// when there is a change
	const [pulledTrackRecord, setPulledTrackRecord] = useState<
		Record<string, MediaStreamTrack>
	>({})
	// using useRef here because we don't care about making React
	// re-render when this changes and the api is easier to deal with
	const pendingTracksRef = useRef<Record<string, Promise<MediaStreamTrack>>>({})
	const mountedRef = useRef(true)
	const { peer } = useRoomContext()

	useEffect(() => {
		if (peer === null) return
		const pendingTracks = pendingTracksRef.current
		for (const track of tracksToPull) {
			if (track in pulledTrackRecord || track in pendingTracks) continue
			pendingTracks[track] = pullTrack(peer, track).then((mediaStreamTrack) => {
				if (mountedRef.current) {
					setPulledTrackRecord((tm) => ({ ...tm, [track]: mediaStreamTrack }))
					delete pendingTracks[track]
				}
				return mediaStreamTrack
			})
		}

		return () => {
			for (const track in pulledTrackRecord) {
				if (!tracksToPull.includes(track)) {
					const mediaStreamTrack = pulledTrackRecord[track]
					if (mediaStreamTrack !== null) peer.closeTrack(mediaStreamTrack)
					if (mountedRef.current)
						setPulledTrackRecord((tm) => {
							const clone = { ...tm }
							delete clone[track]
							return clone
						})
				}
			}
			for (const track in pendingTracks) {
				if (!tracksToPull.includes(track)) {
					pendingTracks[track].then((mediaStreamTrack) => {
						peer.closeTrack(mediaStreamTrack)
					})
				}
			}
		}
	}, [peer, pulledTrackRecord, tracksToPull])

	useUnmount(() => {
		mountedRef.current = false
		if (!peer) return
		for (const track in pulledTrackRecord) {
			const mediaStreamTrack = pulledTrackRecord[track]
			if (mediaStreamTrack !== null) peer.closeTrack(mediaStreamTrack)
		}
		const pendingTracks = pendingTracksRef.current
		for (const pendingTrack in pendingTracks) {
			pendingTracks[pendingTrack].then((mediaStreamTrack) => {
				peer.closeTrack(mediaStreamTrack)
			})
		}
	})

	return pulledTrackRecord
}
