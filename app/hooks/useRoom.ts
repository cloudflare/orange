import { useEffect, useMemo, useState } from 'react'
import type { ClientMessage, RoomState, ServerMessage } from '~/types/Messages'
import assertNever from '~/utils/assertNever'

import usePartySocket from 'partysocket/react'
import type { UserMedia } from './useUserMedia'

export default function useRoom({
	roomName,
	userMedia,
}: {
	roomName: string
	userMedia: UserMedia
}) {
	const [roomState, setRoomState] = useState<RoomState>({ users: [] })

	const websocket = usePartySocket({
		party: 'rooms',
		room: roomName,
		onMessage: (e) => {
			const message = JSON.parse(e.data as string) as ServerMessage
			switch (message.type) {
				case 'roomState':
					// prevent updating state if nothing has changed
					if (JSON.stringify(message.state) === JSON.stringify(roomState)) break
					setRoomState(message.state)
					break
				case 'error':
					console.error('Received error message from WebSocket')
					console.error(message.error)
					break
				case 'directMessage':
					break
				case 'muteMic':
					userMedia.turnMicOff()
					break
				case 'partyserver-pong':
					// do nothing
					break
				default:
					assertNever(message)
					break
			}
		},
	})

	// setup a simple ping pong
	useEffect(() => {
		const interval = setInterval(() => {
			websocket.send(
				JSON.stringify({ type: 'partyserver-ping' } satisfies ClientMessage)
			)
		}, 10000)

		return () => clearInterval(interval)
	}, [websocket])

	const identity = useMemo(
		() => roomState.users.find((u) => u.id === websocket.id),
		[roomState.users, websocket.id]
	)

	const otherUsers = useMemo(
		() => roomState.users.filter((u) => u.id !== websocket.id && u.joined),
		[roomState.users, websocket.id]
	)

	return { identity, otherUsers, websocket, roomState }
}
