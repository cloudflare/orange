import type { LoaderFunctionArgs } from '@remix-run/cloudflare'
import { proxyToCallsApi } from 'partytracks/server'

const proxy = async ({ request, context }: LoaderFunctionArgs) =>
	proxyToCallsApi({
		appId: context.env.CALLS_APP_ID,
		token: context.env.CALLS_APP_SECRET,
		replaceProxyPathname: '/api/calls',
		request,
	})

export const loader = proxy
export const action = proxy
