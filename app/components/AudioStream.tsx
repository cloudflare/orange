import type { FC } from 'react'
import { useEffect, useRef } from 'react'

interface AudioStreamProps {
	mediaStreamTrack: MediaStreamTrack
}

export const AudioStream: FC<AudioStreamProps> = ({ mediaStreamTrack }) => {
	const ref = useRef<HTMLAudioElement>(null)

	useEffect(() => {
		const audio = ref.current
		if (!audio) return
		const mediaStream = new MediaStream()
		mediaStream.addTrack(mediaStreamTrack)
		audio.srcObject = mediaStream
	}, [mediaStreamTrack])

	return <audio ref={ref} autoPlay />
}
