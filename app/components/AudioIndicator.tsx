import type { FC } from 'react'
import useAudioLevel from '~/hooks/useAudioLevel'

interface AudioIndicatorProps {
	audioTrack: MediaStreamTrack
	className?: string
}

export const AudioIndicator: FC<AudioIndicatorProps> = ({ audioTrack }) => {
	const audioLevel = useAudioLevel(audioTrack)
	const minSize = 0.6
	const scaleModifier = 0.8
	return (
		<div className="relative">
			<div
				className={'h-4 w-4 rounded-full bg-orange-400 scale-[--scale]'}
				style={
					{
						'--scale': Math.max(minSize, audioLevel + scaleModifier),
					} as any
				}
			></div>
			<div
				className={
					'h-2 w-2 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-200 scale-[--scale]'
				}
				style={
					{
						'--scale': Math.max(minSize, audioLevel + scaleModifier),
					} as any
				}
			></div>
		</div>
	)
}
