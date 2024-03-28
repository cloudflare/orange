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
	const { peer } = useRoomContext()
	// using useState here because we want React to re-render here
	// when there is a change
	const [pulledTrackRecord, setPulledTrackRecord] = useState<
		Record<string, MediaStreamTrack>
	>({})
	// using useRef here because we don't want React
	// to re-render when these change
	const pendingTracksRef = useRef<Record<string, Promise<MediaStreamTrack>>>({})
	const tracksToPullRef = useRef(tracksToPull)
	tracksToPullRef.current = tracksToPull
	const mountedRef = useRef(true)

	useUnmount(() => {
		mountedRef.current = false
	})

	// when peer changes, wipe out previous track info
	// but we don't need to worry about closing them
	// because teardown of peer will have taken care
	// of that. It's important to do this before pulling
	// tracks in the next effect below!
	useEffect(() => {
		if (mountedRef.current) {
			setPulledTrackRecord({})
			pendingTracksRef.current = {}
		}
	}, [peer])

	useEffect(() => {
		if (!peer) return
		tracksToPull.forEach((track) => {
			const alreadyPulled =
				pulledTrackRecord[track] ||
				pendingTracksRef.current[track] !== undefined
			if (alreadyPulled) return
			const pending = pullTrack(peer, track).then((mediaStreamTrack) => {
				if (!mountedRef.current) return mediaStreamTrack
				if (tracksToPullRef.current.includes(track)) {
					setPulledTrackRecord((current) => ({
						...current,
						[track]: mediaStreamTrack,
					}))
					delete pendingTracksRef.current[track]
				} else {
					peer.closeTrack(mediaStreamTrack)
				}
				return mediaStreamTrack
			})
			pendingTracksRef.current[track] = pending
		})

		const trackSet = new Set(tracksToPull)
		Object.entries(pulledTrackRecord).forEach(([key, value]) => {
			if (trackSet.has(key)) {
				return
			}
			peer.closeTrack(value)
			setPulledTrackRecord((current) => {
				const clone = { ...current }
				delete clone[key]
				return clone
			})
		})
	}, [peer, pulledTrackRecord, tracksToPull])

	useEffect(() => {
		if (!peer) return
		const pendingTracks = pendingTracksRef.current
		return () => {
			if (mountedRef.current) return
			Object.values(pendingTracks).forEach((promise) => {
				promise.then((t) => peer.closeTrack(t))
			})
			Object.values(pulledTrackRecord).forEach((t) => peer.closeTrack(t))
		}
	}, [peer, pulledTrackRecord])

	return pulledTrackRecord
}
