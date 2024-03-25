import type { EntryContext } from '@remix-run/cloudflare'
import { RemixServer } from '@remix-run/react'
import { renderToString } from 'react-dom/server'
import { RELEASE, SENTRY_DSN } from './utils/constants'

export default function handleRequest(
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	remixContext: EntryContext
) {
	try {
		let markup = renderToString(
			<RemixServer context={remixContext} url={request.url} />
		).replace(
			'__CLIENT_ENV__',
			`
			<script>
				window.ENV = ${JSON.stringify({
					RELEASE: RELEASE ?? 'dev',
					SENTRY_DSN: SENTRY_DSN,
				})}
			</script>
		`
		)
		responseHeaders.set('Content-Type', 'text/html; charset=utf-8')
		return new Response('<!DOCTYPE html>' + markup, {
			status: responseStatusCode,
			headers: responseHeaders,
		})
	} catch (error) {
		console.error(error)
		responseHeaders.set('Content-Type', 'text/html; charset=utf-8')
		return new Response(
			'<!DOCTYPE html>' +
				`<body>
					<p>Something went really wrong. We've been notified and are working on it!</p>
				</body>`,
			{
				status: 500,
				headers: responseHeaders,
			}
		)
	}
}
