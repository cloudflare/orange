import { resilientTrack$ } from 'partytracks/client'
import type { Observable } from 'rxjs'
import { getSortedDeviceListObservable } from './getDeviceListObservable'

export function getUserMediaTrack$(
	kind: 'audioinput' | 'videoinput'
): Observable<MediaStreamTrack> {
	return resilientTrack$({
		kind,
		devicePriority$: getSortedDeviceListObservable(),
	})
}
