import { useEffect } from 'react'
import { useUnmount } from 'react-use'
import type { ClientMessage, User } from '~/types/Messages'
import type Peer from '~/utils/Peer.client'

import type PartySocket from 'partysocket'
import type { RoomContextType } from './useRoomContext'
import type { UserMedia } from './useUserMedia'

interface Config {
	userMedia: UserMedia
	peer: Peer | null
	identity?: User
	websocket: PartySocket
	pushedTracks: RoomContextType['pushedTracks']
	raisedHand: boolean
	speaking: boolean
}

export default function useBroadcastStatus({
	userMedia,
	identity,
	websocket,
	peer,
	pushedTracks,
	raisedHand,
	speaking,
}: Config) {
	const { audioEnabled, videoEnabled, screenShareEnabled } = userMedia
	const { audio, video, screenshare } = pushedTracks

	const id = identity?.id
	const name = identity?.name
	useEffect(() => {
		if (id && name) {
			const user = {
				id,
				name,
				joined: true,
				raisedHand,
				speaking,
				transceiverSessionId: peer?.sessionId,
				tracks: {
					audioEnabled,
					videoEnabled,
					screenShareEnabled,
					video,
					audio,
					screenshare,
				},
			}

			function sendUserUpdate() {
				websocket.send(
					JSON.stringify({
						type: 'userUpdate',
						user,
					} satisfies ClientMessage)
				)
			}

			// let's send our userUpdate right away
			sendUserUpdate()

			// anytime we reconnect, we need to resend our userUpdate
			websocket.addEventListener('open', sendUserUpdate)

			return () => websocket.removeEventListener('open', sendUserUpdate)
		}
	}, [
		id,
		name,
		websocket,
		peer?.sessionId,
		audio,
		video,
		screenshare,
		audioEnabled,
		videoEnabled,
		screenShareEnabled,
		raisedHand,
		speaking,
	])

	useUnmount(() => {
		if (id && name) {
			websocket.send(
				JSON.stringify({
					type: 'userUpdate',
					user: {
						id,
						name,
						joined: false,
						raisedHand,
						speaking,
						transceiverSessionId: peer?.sessionId,
						tracks: {},
					},
				} satisfies ClientMessage)
			)
		}
	})
}
