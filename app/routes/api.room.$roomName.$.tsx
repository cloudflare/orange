import type {
	ActionFunctionArgs,
	LoaderFunctionArgs,
} from '@remix-run/cloudflare'
import { handleApiRequest } from '~/api/roomsApi.server'
import { ACCESS_AUTHENTICATED_USER_EMAIL_HEADER } from '~/utils/constants'
import getUsername from '~/utils/getUsername.server'

// handles all other methods
export const action = async ({ request, context }: ActionFunctionArgs) => {
	const url = new URL(request.url)
	let path = url.pathname.slice(1).split('/')
	const username = await getUsername(request)
	if (username === null)
		throw new Response(null, {
			status: 401,
		})
	if (context.mode === 'development') {
		request.headers.set(ACCESS_AUTHENTICATED_USER_EMAIL_HEADER, username)
	}
	return handleApiRequest(path.slice(1), request, context)
}

// handles get requests
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
	const url = new URL(request.url)
	let path = url.pathname.slice(1).split('/')
	const username = await getUsername(request)
	if (username === null)
		throw new Response(null, {
			status: 401,
		})
	if (context.mode === 'development')
		request.headers.set(ACCESS_AUTHENTICATED_USER_EMAIL_HEADER, username)
	return handleApiRequest(path.slice(1), request, context)
}
