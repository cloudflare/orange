import { BehaviorSubject, Observable, merge, of } from 'rxjs'

export interface GetDeviceListOptions {
	prioritizeList?: Array<Partial<MediaDeviceInfo>>
	deprioritizeList?: Array<Partial<MediaDeviceInfo>>
}

export const sortMediaDeviceInfo =
	(options: GetDeviceListOptions) =>
	(a: MediaDeviceInfo, b: MediaDeviceInfo) => {
		const { prioritizeList = [], deprioritizeList = [] } = options
		const priorityA = prioritizeList.findIndex(
			(item) => item.label === a.label && item.kind === a.kind
		)
		const priorityB = prioritizeList.findIndex(
			(item) => item.label === b.label && item.kind === b.kind
		)

		// both are in the prioritizeList,
		// compare indicies to sort
		if (priorityA !== -1 && priorityB !== -1) {
			return priorityA - priorityB
		} else if (priorityA !== -1) {
			return -1
		} else if (priorityB !== -1) {
			return 1
		}

		if (b.label.toLowerCase().includes('virtual')) {
			return -1
		}

		if (b.label.toLowerCase().includes('iphone microphone')) {
			return -1
		}

		const deprioritizeA = deprioritizeList.some(
			(item) => item.label === a.label && item.kind === a.kind
		)
		const deprioritizeB = deprioritizeList.some(
			(item) => item.label === b.label && item.kind === b.kind
		)

		if (deprioritizeA && !deprioritizeB) {
			// move A down the list
			return 1
		} else if (!deprioritizeA && deprioritizeB) {
			// move B down the list
			return -1
		}

		// leave as is
		return 0
	}

const PRIORITIZED_DEVICE_LIST = 'PRIORITIZED_DEVICE_LIST'
const DEPRIORITIZED_DEVICE_LIST = 'DEPRIORITIZED_DEVICE_LIST'

export function getPrioritizationList(): Array<Partial<MediaDeviceInfo>> {
	const values = localStorage.getItem(PRIORITIZED_DEVICE_LIST)
	if (values === null) return []
	return JSON.parse(values)
}

export function prependDeviceToPrioritizeList(
	device: Partial<MediaDeviceInfo>
) {
	removeDeviceFromPrioritizeList(device)
	removeDeviceFromDeprioritizeList(device)
	localStorage.setItem(
		PRIORITIZED_DEVICE_LIST,
		JSON.stringify([device, ...getPrioritizationList()])
	)
	devicePrioritizationListBehaviorSubject.next(getPrioritizationList())
}

export function removeDeviceFromPrioritizeList(
	device: Partial<MediaDeviceInfo>
) {
	localStorage.setItem(
		PRIORITIZED_DEVICE_LIST,
		JSON.stringify(
			getPrioritizationList().filter(
				(v) => !(v.label === device.label && v.kind === device.kind)
			)
		)
	)
	devicePrioritizationListBehaviorSubject.next(getPrioritizationList())
}

export function getDeprioritizationList(): Array<Partial<MediaDeviceInfo>> {
	const values = localStorage.getItem(DEPRIORITIZED_DEVICE_LIST)
	if (values === null) return []
	return JSON.parse(values)
}

export function appendDeviceToDeprioritizeList(
	device: Partial<MediaDeviceInfo>
) {
	localStorage.setItem(
		DEPRIORITIZED_DEVICE_LIST,
		JSON.stringify([...getDeprioritizationList(), device])
	)
	deviceDeprioritizationListBehaviorSubject.next(getDeprioritizationList())
}

export function removeDeviceFromDeprioritizeList(
	device: Partial<MediaDeviceInfo>
) {
	localStorage.setItem(
		DEPRIORITIZED_DEVICE_LIST,
		JSON.stringify(
			getDeprioritizationList().filter(
				(v) => !(v.label === device.label && v.kind === device.kind)
			)
		)
	)
	deviceDeprioritizationListBehaviorSubject.next(getDeprioritizationList())
}

const devicePrioritizationListBehaviorSubject = new BehaviorSubject<
	Partial<MediaDeviceInfo>[]
>([])

const deviceDeprioritizationListBehaviorSubject = new BehaviorSubject<
	Partial<MediaDeviceInfo>[]
>([])

export function getPrioritizedDeviceListObservable(): Observable<
	Partial<MediaDeviceInfo>[]
> {
	return merge(
		devicePrioritizationListBehaviorSubject,
		of(getPrioritizationList())
	)
}

export function getDeprioritizedDeviceListObservable() {
	return merge(
		deviceDeprioritizationListBehaviorSubject,
		of(getDeprioritizationList())
	)
}
