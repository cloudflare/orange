import { forwardRef } from 'react'
import { cn } from '~/utils/style'
import type { VideoSrcObjectProps } from './VideoSrcObject'
import { VideoSrcObject } from './VideoSrcObject'

export const SelfView = forwardRef<HTMLVideoElement, VideoSrcObjectProps>(
	({ className, ...rest }, ref) => (
		<VideoSrcObject
			className={cn('-scale-x-100', className)}
			muted
			{...rest}
			ref={ref}
		/>
	)
)

SelfView.displayName = 'SelfView'
