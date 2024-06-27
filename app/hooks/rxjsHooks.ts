import { useEffect, useRef, useState } from 'react'
import { BehaviorSubject, Observable } from 'rxjs'

export function useSubscribedState<T>(observable: Observable<T>): T | undefined
export function useSubscribedState<T>(
	observable: Observable<T>,
	defaultValue: T
): T
export function useSubscribedState<T>(
	observable: Observable<T>,
	defaultValue?: T
): T {
	const [state, setState] = useState(defaultValue)
	useObservableEffect(observable, setState)
	return state as any
}

export function useObservableEffect<T>(
	observable: Observable<T>,
	fn: (value: T) => void
) {
	const fnRef = useRef(fn)
	fnRef.current = fn
	useSettledEffect(() => {
		const subscription = observable.subscribe((v) => fnRef.current(v))
		return () => {
			subscription.unsubscribe()
		}
	}, [observable])
}

const noop = () => {}

/**
 * Effect that only runs once the effect has stopped
 * re-running long enough for the event loop to drain
 */
export function useSettledEffect(
	fn: () => void | (() => void),
	deps?: unknown[]
) {
	const fnRef = useRef(fn)
	fnRef.current = fn

	const cleanupRef = useRef<() => void>(noop)
	useEffect(() => {
		const timeout = setTimeout(() => {
			cleanupRef.current = fnRef.current() ?? noop
		})
		return () => {
			clearTimeout(timeout)
			cleanupRef.current()
			cleanupRef.current = noop
		}
	}, deps)
}

/**
 * Turns a value into a stable observable that will emit new
 * values when the value changes, and completes upon unmounting.
 */
export function useStateObservable<T>(value: T) {
	const ref = useRef(new BehaviorSubject(value))
	const previousValue = useRef<T>()
	if (previousValue.current !== value) {
		previousValue.current = value
		ref.current.next(value)
	}

	useEffect(() => {
		const { current } = ref
		if (!current) return
		return () => {
			current.complete()
		}
	}, [])

	return ref.current.asObservable()
}
