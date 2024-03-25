import { forwardRef, useEffect, useRef } from 'react'
import { cn } from '~/utils/style'

export type VideoSrcObjectProps = Omit<
	JSX.IntrinsicElements['video'],
	'ref'
> & {
	videoTrack?: MediaStreamTrack
}

export const VideoSrcObject = forwardRef<HTMLVideoElement, VideoSrcObjectProps>(
	({ videoTrack, className, ...rest }, ref) => {
		const internalRef = useRef<HTMLVideoElement | null>(null)

		useEffect(() => {
			const mediaStream = new MediaStream()
			if (videoTrack) mediaStream.addTrack(videoTrack)
			const video = internalRef.current
			if (video) {
				video.srcObject = mediaStream
				video.setAttribute('autoplay', 'true')
				video.setAttribute('playsinline', 'true')
			}
			return () => {
				if (videoTrack) mediaStream.removeTrack(videoTrack)
				const video = internalRef.current
				if (video) video.srcObject = null
			}
		}, [videoTrack])

		return (
			<video
				className={cn('bg-zinc-700', className)}
				ref={(v) => {
					internalRef.current = v
					if (ref === null) return
					if (typeof ref === 'function') {
						ref(v)
					} else {
						ref.current = v
					}
				}}
				{...rest}
			/>
		)
	}
)

VideoSrcObject.displayName = 'VidoSrcObject'
