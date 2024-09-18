import { type ActionFunctionArgs } from '@remix-run/cloudflare'
import { Form } from '@remix-run/react'
import { AnalyticsSimpleCallFeedback, getDb } from 'schema'
import { Button } from '~/components/Button'
import { RELEASE } from '~/utils/constants'

const redirectToHome = new Response(null, {
	status: 302,
	headers: {
		Location: '/',
	},
})

export const action = async ({ request, context }: ActionFunctionArgs) => {
	const db = getDb(context)
	if (!db) return redirectToHome

	const formData = await request.formData()
	const experiencedIssues = formData.get('experiencedIssues') === 'true'
	await db.insert(AnalyticsSimpleCallFeedback).values({
		experiencedIssues: Number(experiencedIssues),
		version: RELEASE ?? 'dev',
	})

	return redirectToHome
}

export default function SetUsername() {
	return (
		<div className="grid h-full gap-4 place-content-center">
			<h1 className="text-3xl font-bold">Experience any issues?</h1>
			<Form className="flex items-end gap-4" method="post">
				<Button displayType="secondary" value="true" name="experiencedIssues">
					Yes
				</Button>
				<Button displayType="secondary" value="false" name="experiencedIssues">
					No
				</Button>
			</Form>
		</div>
	)
}
