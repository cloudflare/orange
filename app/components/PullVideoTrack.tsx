import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
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
		if (videoTrack && peer)
			return () => {
				peer.closeTrack(videoTrack)
			}
	}, [videoTrack, peer])

	return children({ videoTrack, audioTrack })
}
