import { useRoomContext } from '~/hooks/useRoomContext'
import type { ClientMessage } from '~/types/Messages'
import { AiPushToTalkButtion } from './AiPushToTalkButton'
import { Button } from './Button'

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

	return (
		<>
			{error && <span className="text-red-800 dark:text-red-500">{error}</span>}
			{connected ? (
				<AiPushToTalkButtion />
			) : (
				<Button
					onClick={() =>
						websocket.send(
							JSON.stringify({ type: 'enableAi' } satisfies ClientMessage)
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
