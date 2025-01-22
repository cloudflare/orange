import type { LoaderFunctionArgs } from '@remix-run/cloudflare'
import { routePartyTracksRequest } from 'partytracks/server'

const proxy = async ({ request, context }: LoaderFunctionArgs) =>
	routePartyTracksRequest({
		appId: context.env.CALLS_APP_ID,
		token: context.env.CALLS_APP_SECRET,
		baseUrl: context.env.CALLS_API_URL,
		prefix: context.env.CALLS_API_PREFIX,
		request,
	})

export const loader = proxy
export const action = proxy
