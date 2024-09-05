import type { FC, ReactNode } from 'react'
import { createContext, useContext, useState } from 'react'
import { AudioStream } from './AudioStream'

interface PullAudioTracksProps {
	audioTracks: string[]
	children?: ReactNode
}

const AudioTrackContext = createContext<Record<string, MediaStreamTrack>>({})

export const PullAudioTracks: FC<PullAudioTracksProps> = ({
	audioTracks,
	children,
}) => {
	const [audioTrackMap, setAudioTrackMap] = useState<
		Record<string, MediaStreamTrack>
	>({})

	return (
		<AudioTrackContext.Provider value={audioTrackMap}>
			<AudioStream
				tracksToPull={audioTracks}
				onTrackAdded={(id, track) =>
					setAudioTrackMap((previous) => ({
						...previous,
						[id]: track,
					}))
				}
				onTrackRemoved={(id) => {
					setAudioTrackMap((previous) => {
						const update = { ...previous }
						delete update[id]
						return update
					})
				}}
			/>
			{children}
		</AudioTrackContext.Provider>
	)
}

export function usePulledAudioTracks() {
	return useContext(AudioTrackContext)
}

export function usePulledAudioTrack(track?: string) {
	const tracks = usePulledAudioTracks()
	return track ? tracks[track] : undefined
}
