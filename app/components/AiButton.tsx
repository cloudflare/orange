import { useSearchParams } from '@remix-run/react'
import { useRoomContext } from '~/hooks/useRoomContext'
import type { ClientMessage } from '~/types/Messages'
import { AiPushToTalkButtion } from './AiPushToTalkButton'
import { Button } from './Button'

function RemoveAiButton() {
	const {
		room: { websocket },
	} = useRoomContext()
	return (
		<Button
			onClick={() =>
				websocket.send(
					JSON.stringify({ type: 'disableAi' } satisfies ClientMessage)
				)
			}
			className="text-xs"
			displayType="ghost"
		>
			Remove AI
		</Button>
	)
}

export function AiButton() {
	const {
		room: {
			websocket,
			roomState: {
				ai: { connectionPending, error },
				users,
			},
		},
	} = useRoomContext()

	const connected = users.some((u) => u.id === 'ai')
	const [params] = useSearchParams()
	const voice = params.get('voice') ?? undefined
	const instructions = params.get('instructions') ?? undefined

	return (
		<>
			{error && <span className="text-red-800 dark:text-red-500">{error}</span>}
			{connected ? (
				<>
					<RemoveAiButton />
					<AiPushToTalkButtion />
				</>
			) : (
				<Button
					onClick={() =>
						websocket.send(
							JSON.stringify({
								type: 'enableAi',
								voice,
								instructions,
							} satisfies ClientMessage)
						)
					}
					className="text-xs flex items-center gap-2"
					disabled={connectionPending}
				>
					<span>Invite AI</span>
				</Button>
			)}
		</>
	)
}
