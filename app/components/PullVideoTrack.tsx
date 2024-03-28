import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useRoomContext } from '~/hooks/useRoomContext'
import keepTrying from '~/utils/keepTrying'
import { usePulledAudioTrack } from './PullAudioTracks'

interface PullTracksProps {
	audio?: string
	video?: string
	children: (props: {
		audioTrack?: MediaStreamTrack
		videoTrack?: MediaStreamTrack
	}) => ReactElement
}

export const PullVideoTrack = ({ video, audio, children }: PullTracksProps) => {
	const { peer } = useRoomContext()
	const peerSessionIdRef = useRef(peer?.sessionId)
	peerSessionIdRef.current = peer?.sessionId

	const [videoTrack, setVideoTrack] = useState<MediaStreamTrack>()
	const audioTrack = usePulledAudioTrack(audio)

	useEffect(() => {
		if (!video || !peer) return
		let mounted = true
		const cancel = keepTrying(() => {
			const [sessionId, trackName] = video.split('/')
			// backward compatibility: ResourceID -> TrackObject
			return peer
				.pullTrack({ location: 'remote', sessionId, trackName })
				.then((track) => {
					if (mounted) setVideoTrack(track)
				})
		})
		return () => {
			cancel()
			mounted = false
		}
	}, [peer, video])

	useEffect(() => {
		if (videoTrack && peer?.sessionId) {
			return () => {
				// only close track if the peer session id hasn't changed
				if (peer.sessionId === peerSessionIdRef.current)
					peer.closeTrack(videoTrack)
			}
		}
	}, [peer, videoTrack])

	return children({ videoTrack, audioTrack })
}
