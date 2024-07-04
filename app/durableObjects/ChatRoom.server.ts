import type { Env } from '~/types/Env'
import type { ClientMessage, ServerMessage, User } from '~/types/Messages'
import { assertError } from '~/utils/assertError'
import assertNever from '~/utils/assertNever'
import { assertNonNullable } from '~/utils/assertNonNullable'
import getUsername from '~/utils/getUsername.server'

import {
	Server,
	type Connection,
	type ConnectionContext,
	type WSMessage,
} from 'partyserver'

/**
 * The ChatRoom Durable Object Class
 *
 * ChatRoom implements a Durable Object that coordinates an
 * individual chat room. Participants connect to the room using
 * WebSockets, and the room broadcasts messages from each participant
 * to all others.
 */
export class ChatRoom extends Server<Env> {
	static options = {
		hibernate: true,
	}

	async onStart(): Promise<void> {
		// TODO: make this a part of partyserver
		this.ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair(
				JSON.stringify({ type: 'partyserver-ping' }),
				JSON.stringify({ type: 'partyserver-pong' })
			)
		)

		if (!(await this.ctx.storage.getAlarm())) {
			// start the alarm to broadcast state every 30 seconds
			await this.ctx.storage.setAlarm(30000)
		}

		// cleaning out storage used by older versions of this code
		// this.ctx.storage.delete('sessions').catch(() => {
		// 	console.warn('Failed to delete old sessions')
		// })
		// We can remove this line later
	}
	async onConnect(
		connection: Connection<User>,
		ctx: ConnectionContext
	): Promise<void> {
		const username = await getUsername(ctx.request)
		assertNonNullable(username)

		const user: User = {
			id: connection.id,
			name: username,
			joined: false,
			raisedHand: false,
			speaking: false,
			tracks: {
				audioEnabled: false,
				videoEnabled: false,
				screenShareEnabled: false,
			},
		}

		connection.setState(user)
		this.broadcastState()
	}

	sendMessage<M extends ServerMessage>(connection: Connection, message: M) {
		connection.send(JSON.stringify(message))
	}

	broadcastState() {
		this.broadcast(
			JSON.stringify({
				type: 'roomState',
				state: {
					users: [...this.getConnections<User>()]
						.map((connection) => connection.state)
						.filter((x) => !!x),
				},
			} satisfies ServerMessage)
		)
	}

	onMessage(connection: Connection<User>, message: WSMessage): void {
		try {
			if (typeof message !== 'string') {
				console.warn('Received non-string message')
				return
			}

			const data = JSON.parse(message) as ClientMessage

			switch (data.type) {
				case 'userLeft':
					// TODO: ??
					break
				case 'userUpdate':
					connection.setState(data.user)
					this.broadcastState()
					break
				case 'directMessage': {
					const { to, message } = data

					for (const otherConnection of this.getConnections<User>()) {
						if (otherConnection.id === to) {
							this.sendMessage(otherConnection, {
								type: 'directMessage',
								from: connection.state!.name,
								message,
							})
							break
						}
					}
					console.warn(
						`User with id "${to}" not found, cannot send DM from "${connection.state!.name}"`
					)
					break
				}
				case 'muteUser':
					for (const otherConnection of this.getConnections<User>()) {
						if (otherConnection.id === data.id) {
							otherConnection.setState({
								...otherConnection.state!,
								tracks: {
									...otherConnection.state!.tracks,
									audioEnabled: false,
								},
							})
							this.sendMessage(otherConnection, {
								type: 'muteMic',
							})

							this.broadcastState()
							break
						}
					}
					console.warn(
						`User with id "${data.id}" not found, cannot mute user from "${connection.state!.name}"`
					)

					break
				case 'partyserver-ping':
					// do nothing, this should never be received
					console.warn(
						"Received partyserver-ping from client. You shouldn't be seeing this message. Did you forget to enable hibernation?"
					)
					break
				default:
					assertNever(data)
					break
			}
		} catch (err) {
			assertError(err)
			// TODO: should this even be here?
			// Report any exceptions directly back to the client. As with our handleErrors() this
			// probably isn't what you'd want to do in production, but it's convenient when testing.
			this.sendMessage(connection, {
				type: 'error',
				error: err.stack,
			} satisfies ServerMessage)
		}
	}

	onClose() {
		this.broadcastState()
	}

	onError(): void | Promise<void> {
		this.broadcastState()
	}

	async alarm(): Promise<void> {
		// technically we don't need to broadcast state on an alarm,
		// but let's keep it for a while and see if it's useful
		this.broadcastState()
		await this.ctx.storage.setAlarm(30000)
	}
}
