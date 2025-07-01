import { redirect } from '@remix-run/cloudflare'

export function safeRedirect(url: string, init?: number | ResponseInit) {
	if (
		['javascript:', 'data:', 'vbscript:'].some((str) =>
			decodeURI(url).trim().toLowerCase().startsWith(str)
		)
	) {
		url = '/'
	}
	return redirect(url, init)
}
