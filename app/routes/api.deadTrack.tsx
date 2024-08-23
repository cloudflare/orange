import type { ActionFunctionArgs } from '@remix-run/cloudflare'
import { json } from '@remix-run/cloudflare'
import type { ChatCard } from '~/types/GoogleChatApi'
import { RELEASE } from '~/utils/constants'

export type DeadTrackInfo = {
	pullSessionTrace: string
	pushedSessionTrace: string
	trackId: string
	pullingUser?: string
	pushingUser?: string
}

export const action = async ({ request, context }: ActionFunctionArgs) => {
	if (!context.env.FEEDBACK_URL || !context.env.FEEDBACK_QUEUE) {
		throw new Response('not found', { status: 404 })
	}
	const info: DeadTrackInfo = await request.json()
	const {
		pullSessionTrace,
		pushedSessionTrace,
		trackId,
		pullingUser,
		pushingUser,
	} = info

	const { hostname } = new URL(request.url)

	const chatCard: ChatCard = {
		cardsV2: [
			{
				cardId: 'orange-meets-dead-track-card',
				card: {
					header: {
						title: `💀 Dead track: ${pullingUser} had issue pulling from ${pushingUser}`,
						subtitle: `Time: ${new Date().toISOString()} Environment: ${hostname} commit: ${RELEASE}`,
						imageUrl:
							'https://developers.google.com/chat/images/quickstart-app-avatar.png',
						imageType: 'CIRCLE',
					},
					sections: [
						{
							header: 'Track ID',
							widgets: [
								{
									textParagraph: {
										text: trackId,
									},
								},
							],
							collapsible: false,
						},
						{
							header: 'Trace links',
							widgets: [
								{
									buttonList: {
										buttons: [
											{
												text: `${pullingUser}'s pull trace`,
												onClick: {
													openLink: {
														url: pullSessionTrace,
													},
												},
											},
											{
												text: `${pushingUser}'s push trace`,
												onClick: {
													openLink: {
														url: pushedSessionTrace,
													},
												},
											},
										],
									},
								},
							],
							collapsible: false,
						},
					],
				},
			},
		],
	}

	await context.env.FEEDBACK_QUEUE.send(chatCard)

	return json({
		status: 'ok',
	})
}
