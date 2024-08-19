import { Observable } from 'rxjs'
import Ewma from '../ewma'

export const ewma =
	(halflifeTime: number, defaultValue = 0) =>
	(observable: Observable<number>) =>
		new Observable<number>((subscribe) => {
			const ewma = new Ewma(halflifeTime, defaultValue)
			observable.subscribe({
				...subscribe,
				next: (value) => {
					ewma.insert(value)
					subscribe.next(ewma.value())
				},
			})
		})
