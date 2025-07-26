import type { Config } from 'drizzle-kit'

const { LOCAL_DB_PATH, DB_ID, D1_TOKEN, CF_ACCOUNT_ID } = process.env

// Use better-sqlite driver for local development
export default LOCAL_DB_PATH
	? ({
			schema: './schema.ts',
			dialect: 'sqlite',
			dbCredentials: {
				url: LOCAL_DB_PATH,
			},
		} satisfies Config)
	: ({
			schema: './schema.ts',
			out: './migrations',
			dialect: 'sqlite',
			driver: 'd1-http',
			dbCredentials: {
				databaseId: DB_ID!,
				token: D1_TOKEN!,
				accountId: CF_ACCOUNT_ID!,
			},
		} satisfies Config)
