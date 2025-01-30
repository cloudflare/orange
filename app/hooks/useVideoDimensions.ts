import { useEffect, useState, type RefObject } from 'react'

export function useVideoDimensions(ref: RefObject<HTMLVideoElement>) {
	const [videoHeight, setVideoHeight] = useState(ref.current?.videoHeight ?? 0)
	const [videoWidth, setVideoWidth] = useState(ref.current?.videoHeight ?? 0)

	useEffect(() => {
		const video = ref.current
		if (!video) return
		const handler = () => {
			setVideoHeight(video.videoHeight)
			setVideoWidth(video.videoWidth)
		}
		video.addEventListener('resize', handler)
		return () => {
			video.removeEventListener('resize', handler)
		}
	}, [ref])

	return { videoHeight, videoWidth }
}
