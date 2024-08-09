export const ACCESS_AUTHENTICATED_USER_EMAIL_HEADER =
	'Cf-Access-Authenticated-User-Email'

declare global {
	const __SENTRY_DSN__: string | undefined
	const __RELEASE__: string | undefined
}

export const SENTRY_DSN =
	typeof __SENTRY_DSN__ !== 'undefined' ? __SENTRY_DSN__ : undefined

export const RELEASE: string | undefined =
	typeof __RELEASE__ !== 'undefined' ? __RELEASE__ : undefined
