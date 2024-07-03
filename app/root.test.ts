import { Crypto } from '@peculiar/webcrypto'
import { describe, expect, it, vi } from 'vitest'
import { loader } from './root'
import { commitSession, getSession } from './session'
import { ACCESS_AUTHENTICATED_USER_EMAIL_HEADER } from './utils/constants'

vi.stubGlobal('crypto', new Crypto())

const CF_AppSession = 'oaiwjefoaijwefoij'

const headers = {
	alg: 'RS256',
	kid: '4f2b915516cbde0e0296787164a6d4e98a9674842ab96196de9e7e9873501daf',
}
const payload = {
	aud: ['aoiwejfoaiwejfoiawjefoijaweoifjaoijeoifjawoiejf'],
	email: 'hello@world.com',
	exp: 0,
	iat: 0,
	nbf: 0,
	iss: 'https://example.com',
	type: 'app',
	identity_nonce: 'oawiejfoaiwjef',
	sub: 'awoiefjawoiejfaoiwjefoiajw',
	country: 'US',
}
const signature =
	'aowiejfaowiejfoaiwjefoiawjefoiawjefoiajwefoijaweoifjoaiwjefoijawoiefj'

describe('root loader', () => {
	it('should expire cookies and redirect back to the original URL if CF_Authorization Cookie will expire in five minutes', async () => {
		const inFiveMinutes = new Date()
		inFiveMinutes.setMinutes(inFiveMinutes.getMinutes() + 5)

		const Cookie = `CF_AppSession=${CF_AppSession}; CF_Authorization=${[
			headers,
			{ ...payload, exp: Math.round(inFiveMinutes.getTime() / 1000) },
			signature,
		]
			.map((s) => btoa(JSON.stringify(s)))
			.join('.')}`

		const url = new URL('https://orange.cloudflare.dev/')

		const request = new Request(url, {
			headers: {
				Cookie,
				'Sec-Fetch-User': '?1',
				[ACCESS_AUTHENTICATED_USER_EMAIL_HEADER]: 'test@email.com',
			},
		})

		try {
			await loader({ request, context: { env: {} } as any, params: {} })
		} catch (e) {
			if (!(e instanceof Response)) throw e
			var response = e
			expect(response.status).toBe(302)
			expect(response.headers.get('Location')).toBe(url.toString())
			expect(response.headers.get('Set-Cookie')).toBe(
				[
					'CF_Authorization=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/;',
					'CF_AppSession=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/;',
				].join(', ')
			)
		}
	})

	it('should return null if Sec-Fetch-User header is missing, even if about to expire', async () => {
		const inFiveMinutes = new Date()
		inFiveMinutes.setMinutes(inFiveMinutes.getMinutes() + 5)

		const Cookie = `CF_AppSession=${CF_AppSession}; CF_Authorization=${[
			headers,
			{ ...payload, exp: Math.round(inFiveMinutes.getTime() / 1000) },
			signature,
		]
			.map((s) => btoa(JSON.stringify(s)))
			.join('.')}`

		const url = new URL('https://orange.cloudflare.dev/')

		const request = new Request(url, {
			headers: {
				Cookie,
				[ACCESS_AUTHENTICATED_USER_EMAIL_HEADER]: 'test@email.com',
			},
		})

		const response = await loader({
			request,
			context: { env: {} } as any,
			params: {},
		})

		expect(response?.status).not.equals(302)
	})

	it('should return null if CF_Authorization Cookie will expire in 25 hours', async () => {
		const inTwentyFiveHours = new Date()
		inTwentyFiveHours.setHours(inTwentyFiveHours.getHours() + 25)

		const Cookie = `CF_AppSession=${CF_AppSession}; CF_Authorization=${[
			headers,
			{ ...payload, exp: Math.round(inTwentyFiveHours.getTime() / 1000) },
			signature,
		]
			.map((s) => btoa(JSON.stringify(s)))
			.join('.')}`

		const request = new Request('https://orange.cloudflare.dev', {
			headers: {
				Cookie,
				'Sec-Fetch-User': '?1',
				[ACCESS_AUTHENTICATED_USER_EMAIL_HEADER]: 'test@email.com',
			},
		})

		const response = await loader({
			request,
			context: { env: {} } as any,
			params: {},
		})

		expect(response?.status).not.equals(302)
	})

	it('should redirect to /set-username if CF_Authorization Cookie is missing', async () => {
		const request = new Request('https://orange.cloudflare.dev', {})
		let redirect = null
		try {
			const response = await loader({
				request,
				context: { env: {} } as any,
				params: {},
			})
			expect(response.status).not.equals(302)
		} catch (r) {
			if (!(r instanceof Response)) throw r
			redirect = r
		}
		expect(redirect?.status).toBe(302)
	})

	it('should NOT redirect to /set-username if CF_Authorization Cookie is missing but username is set', async () => {
		const session = await getSession()

		session.set('username', 'Kevin')

		const [Cookie] = await commitSession(session).then((c) => c.split(';'))

		const request = new Request('https://orange.cloudflare.dev', {
			headers: { Cookie: Cookie },
		})
		let redirect = null
		try {
			const response = await loader({
				request,
				context: { env: {} } as any,
				params: {},
			})
			expect(response.status).not.equals(302)
		} catch (r) {
			if (!(r instanceof Response)) throw r
			redirect = r
		}
		expect(redirect?.status).not.equals(302)
	})
})
