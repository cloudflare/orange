import { redirect } from '@remix-run/cloudflare'
import { commitSession, getSession } from '~/session'
import { ACCESS_AUTHENTICATED_USER_EMAIL_HEADER } from './constants'

export async function setUsername(
	username: string,
	request: Request,
	returnUrl: string = '/'
) {
	const session = await getSession(request.headers.get('Cookie'))
	session.set('username', username)
	throw redirect(returnUrl, {
		headers: {
			'Set-Cookie': await commitSession(session),
		},
	})
}

/**
 * Utility for getting the username. In prod, this basically
 * just consists of getting the Cf-Access-Authenticated-User-Email
 * header, but in dev we allow manually setting this via the
 * username query param.
 */
export default async function getUsername(request: Request) {
	const accessUsername = request.headers.get(
		ACCESS_AUTHENTICATED_USER_EMAIL_HEADER
	)
	if (accessUsername) return accessUsername

	const session = await getSession(request.headers.get('Cookie'))
	const sessionUsername = session.get('username')
	if (typeof sessionUsername === 'string') return sessionUsername

	return null
}
