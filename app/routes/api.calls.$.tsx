import type { LoaderFunctionArgs } from '@remix-run/cloudflare'
import invariant from 'tiny-invariant'

const proxiedUrl = (url: string, appId: string) => {
	const previousUrl = new URL(url)
	const proxyUrl = new URL('https://rtc.live.cloudflare.com')
	proxyUrl.pathname = previousUrl.pathname.replace(
		'/api/calls',
		`/v1/apps/${appId}`
	)
	proxyUrl.search = previousUrl.search
	return proxyUrl
}

const proxyCallsApi = async ({ request, context }: LoaderFunctionArgs) => {
	const { headers, body, url, method } = request
	const newHeaders = new Headers(headers)
	newHeaders.set('Authorization', `Bearer ${context.env.CALLS_APP_SECRET}`)
	const proxyInit: RequestInit = {
		headers: newHeaders,
		method,
	}

	const contentLength = headers.get('Content-Length')

	if (contentLength !== null) {
		const parsedContentLength = Number(contentLength)
		invariant(
			!isNaN(parsedContentLength),
			'Content-Length header is not a number'
		)
		if (parsedContentLength > 0 || headers.has('Transfer-Encoding')) {
			proxyInit.body = body
		}
	}

	return fetch(proxiedUrl(url, context.env.CALLS_APP_ID), proxyInit)
}

export const loader = proxyCallsApi
export const action = proxyCallsApi
