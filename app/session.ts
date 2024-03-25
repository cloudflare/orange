import { createCookieSessionStorage } from '@remix-run/cloudflare'

export const { getSession, commitSession, destroySession } =
	createCookieSessionStorage({
		// a Cookie from `createCookie` or the same CookieOptions to create one
		cookie: {
			name: '__session',
			secrets: ['oooOOooOOoOOoOOOOoo'],
			sameSite: true,
			httpOnly: true,
		},
	})
