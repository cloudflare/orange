export const debounce = <Callback extends (...args: any[]) => void>(
	callback: Callback,
	wait: number
) => {
	let timeoutId = -1
	return (...args: Parameters<Callback>) => {
		window.clearTimeout(timeoutId)
		timeoutId = window.setTimeout(() => {
			callback(...args)
		}, wait)
	}
}
