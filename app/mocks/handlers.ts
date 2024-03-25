import type { RequestHandler } from 'msw'
import { http, passthrough } from 'msw'

export const handlers: RequestHandler[] = [
	http.post('https://rtc.live.cloudflare.com/apps/:appId/sessions/new', () => {
		// fail randomly 5% of the time
		if (Math.random() < 0.05) {
			return new Response(null, { status: 500 })
		}
		return passthrough()
	}),
]
