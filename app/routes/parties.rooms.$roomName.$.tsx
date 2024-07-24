import type { LoaderFunctionArgs } from '@remix-run/cloudflare'
import { routePartykitRequest } from 'partyserver'

import { ACCESS_AUTHENTICATED_USER_EMAIL_HEADER } from '~/utils/constants'
import getUsername from '~/utils/getUsername.server'

// handles get requests
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
	const username = await getUsername(request)
	if (username === null)
		throw new Response(null, {
			status: 401,
		})
	if (context.mode === 'development')
		request.headers.set(ACCESS_AUTHENTICATED_USER_EMAIL_HEADER, username)
	const partyResponse = await routePartykitRequest(request, context.env)

	return partyResponse || new Response('Not found', { status: 404 })
}
