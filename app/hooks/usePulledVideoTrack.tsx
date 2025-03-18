import { useObservableAsValue, useValueAsObservable } from 'partytracks/react'
import { useMemo } from 'react'
import { of, switchMap } from 'rxjs'
import { useRoomContext } from '~/hooks/useRoomContext'
import type { TrackObject } from '~/utils/callsTypes'

export function usePulledVideoTrack(
	video: string | undefined,
	alwaysUseHighQuality?: boolean
) {
	const { partyTracks, dataSaverMode, simulcastEnabled } = useRoomContext()

	const [sessionId, trackName] = video?.split('/') ?? []
	const trackObject = useMemo(
		() =>
			sessionId && trackName
				? ({
						trackName,
						sessionId,
						location: 'remote',
					} satisfies TrackObject)
				: undefined,
		[sessionId, trackName]
	)

	const preferredRid$ = useValueAsObservable(
		dataSaverMode && !alwaysUseHighQuality ? 'c' : 'a'
	)
	const trackObject$ = useValueAsObservable(trackObject)
	const pulledTrack$ = useMemo(
		() =>
			trackObject$.pipe(
				switchMap((track) =>
					track
						? partyTracks.pull(
								of(track),
								simulcastEnabled ? { simulcast: { preferredRid$ } } : undefined
							)
						: of(undefined)
				)
			),
		[partyTracks, trackObject$, preferredRid$]
	)
	return useObservableAsValue(pulledTrack$)
}
