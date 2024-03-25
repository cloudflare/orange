export {}

declare global {
	interface Window {
		ENV: {
			RELEASE?: string
			SENTRY_DSN?: string
		}
	}
}
