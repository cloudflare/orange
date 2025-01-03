import { useMemo } from 'react'
import { of, switchMap } from 'rxjs'
import { useStateObservable, useSubscribedState } from '~/hooks/rxjsHooks'
import { useRoomContext } from '~/hooks/useRoomContext'
import type { TrackObject } from '~/utils/callsTypes'

export function usePulledVideoTrack(video: string | undefined) {
	const { peer } = useRoomContext()

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

	const trackObject$ = useStateObservable(trackObject)
	const pulledTrack$ = useMemo(
		() =>
			trackObject$.pipe(
				switchMap((track) =>
					track ? peer.pullTrack(of(track)) : of(undefined)
				)
			),
		[peer, trackObject$]
	)
	return useSubscribedState(pulledTrack$)
}
