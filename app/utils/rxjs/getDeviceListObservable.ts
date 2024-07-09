import {
	combineLatest,
	debounceTime,
	fromEvent,
	map,
	merge,
	switchMap,
	withLatestFrom,
} from 'rxjs'
import {
	getDeprioritizedDeviceListObservable,
	getPrioritizedDeviceListObservable,
	sortMediaDeviceInfo,
} from './devicePrioritization'

export function getDeviceListObservable() {
	return merge(
		navigator.mediaDevices.enumerateDevices(),
		fromEvent(navigator.mediaDevices, 'devicechange').pipe(
			debounceTime(1500),
			switchMap(() => navigator.mediaDevices.enumerateDevices())
		)
	)
}

export function getSortedDeviceListObservable() {
	return combineLatest([
		getDeviceListObservable(),
		getPrioritizedDeviceListObservable(),
	]).pipe(
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
