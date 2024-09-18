import type { ActionFunctionArgs } from '@remix-run/cloudflare'
import { AnalyticsRefreshes, getDb } from 'schema'
import { RELEASE } from '~/utils/constants'
import { mode } from '~/utils/mode'

export const action = async ({ context }: ActionFunctionArgs) => {
	const db = getDb(context)
	if (db === null || mode === 'development')
		return new Response(null, { status: 200 })

	await db.insert(AnalyticsRefreshes).values({
		version: RELEASE ?? 'dev',
	})

	return new Response(null, { status: 201 })
}
