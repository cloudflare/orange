import type { ActionFunctionArgs } from '@remix-run/cloudflare'
import { json } from '@remix-run/cloudflare'
import invariant from 'tiny-invariant'
import type { RoomHistory } from '~/hooks/useRoomHistory'
import type { ChatCard } from '~/types/GoogleChatApi'
import type { User } from '~/types/Messages'
import { RELEASE } from '~/utils/constants'

export type BugReportInfo = {
	roomName?: string
	identity?: User
	roomHistory?: RoomHistory
	url?: string
}

export const action = async ({ request, context }: ActionFunctionArgs) => {
	if (
		!context.env.FEEDBACK_URL ||
		!context.env.FEEDBACK_STORAGE ||
		!context.env.FEEDBACK_QUEUE
	) {
		throw new Response('not found', { status: 404 })
	}
	const requestUrl = new URL(request.url)
	const formData = await request.formData()
	const info: BugReportInfo = JSON.parse(String(formData.get('info')))
	const { identity, roomName, roomHistory, url } = info
	const description = formData.get('description')
	invariant(typeof description === 'string')
	const userAgent = request.headers.get('User-Agent')
	invariant(typeof userAgent === 'string')
	invariant(roomName)
	invariant(url)

	const debugInfoId = crypto.randomUUID()
	if (context.env.FEEDBACK_STORAGE) {
		await context.env.FEEDBACK_STORAGE.put(
			debugInfoId,
			JSON.stringify(roomHistory, null, 2)
		)
	}

	const { hostname } = new URL(url)

	const chatCard: ChatCard = {
		cardsV2: [
			{
				cardId: 'orange-meets-feedback-card',
				card: {
					header: {
						title: `Feedback from ${identity?.name ?? ''}`,
						subtitle: `Time: ${new Date().toISOString()} Environment: ${hostname} commit: ${RELEASE}`,
						imageUrl:
							'https://developers.google.com/chat/images/quickstart-app-avatar.png',
						imageType: 'CIRCLE',
						imageAltText: `Feedback from ${identity?.name}`,
					},
					sections: [
						{
							header: 'Description',
							widgets: [
								{
									textParagraph: {
										text: description,
									},
								},
							],
							collapsible: false,
						},
						{
							header: 'User Agent',
							widgets: [
								{
									textParagraph: {
										text: userAgent,
									},
								},
							],
							collapsible: false,
						},
						{
							header: 'Room',
							widgets: [
								{
									buttonList: {
										buttons: [
											{
												text: roomName,
												onClick: {
													openLink: {
														url,
													},
												},
											},
										],
									},
								},
							],
							collapsible: false,
						},
						{
							header: 'Debug Info',
							widgets: [
								{
									buttonList: {
										buttons: [
											{
												text: 'View JSON',
												onClick: {
													openLink: {
														url:
															requestUrl.origin +
															`/api/debugInfo?id=${debugInfoId}`,
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
