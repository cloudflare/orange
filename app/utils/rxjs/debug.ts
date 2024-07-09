import { tap } from 'rxjs'

export function debugTap<T>(message: string) {
	return tap<T>({
		next: (...args) => console.log(message, ...args),
		complete: () => console.log('COMPLETED ', message),
	})
}
