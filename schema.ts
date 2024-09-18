import type { AppLoadContext } from '@remix-run/cloudflare'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const metadataColumns = {
	id: integer('id').primaryKey({ autoIncrement: true }),
	created: text('created')
		.default(sql`CURRENT_TIMESTAMP`)
		.notNull(),
	modified: text('modified')
		.default(sql`CURRENT_TIMESTAMP`)
		.notNull(),
	deleted: text('deleted'),
}

export const AnalyticsRefreshes = sqliteTable('AnalyticsRefreshes', {
	...metadataColumns,
	version: text('version').notNull(),
})

export const AnalyticsSimpleCallFeedback = sqliteTable(
	'AnalyticsSimpleCallFeedback',
	{
		...metadataColumns,
		version: text('version').notNull(),
		experiencedIssues: integer('experiencedIssues').notNull(),
	}
)

export function getDb(context: AppLoadContext) {
	if (!context.env.DB) {
		return null
	}
	return drizzle(context.env.DB)
}
