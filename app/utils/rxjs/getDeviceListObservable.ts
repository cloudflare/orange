import { devices$ } from 'partytracks/client'
import { combineLatest, map, withLatestFrom } from 'rxjs'
import {
	getDeprioritizedDeviceListObservable,
	getPrioritizedDeviceListObservable,
	sortMediaDeviceInfo,
} from './devicePrioritization'

export function getSortedDeviceListObservable() {
	return combineLatest([devices$, getPrioritizedDeviceListObservable()]).pipe(
		// we don't want updating this list to re-trigger acquisition flow
		// so we will just grab the latest here instead of including in the
		// combineLatest above
		withLatestFrom(getDeprioritizedDeviceListObservable()),
		map(([[devices, prioritizeList], deprioritizeList]) =>
			devices.sort(
				sortMediaDeviceInfo({
					prioritizeList,
					deprioritizeList,
				})
			)
		)
	)
}
