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

	// a small typesafe wrapper around connection.send
	sendMessage<M extends ServerMessage>(connection: Connection, message: M) {
		connection.send(JSON.stringify(message))
	}

	async onStart(): Promise<void> {
		// TODO: make this a part of partyserver
		this.ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair(
				JSON.stringify({ type: 'partyserver-ping' }),
				JSON.stringify({ type: 'partyserver-pong' })
			)
		)

		// cleaning out storage used by older versions of this code
		this.ctx.storage.delete('sessions').catch(() => {
			console.warn('Failed to delete old sessions storage')
		})
		// We can remove this line later
	}
	async onConnect(
		connection: Connection<User>,
		ctx: ConnectionContext
	): Promise<void> {
		// let's start the periodic alarm if it's not already started
		if (!(await this.ctx.storage.getAlarm())) {
			// start the alarm to broadcast state every 30 seconds
			this.ctx.storage.setAlarm(Date.now() + 30000)
		}

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

		// store the user's data in storage
		await this.ctx.storage.put(`session-${connection.id}`, JSON.stringify(user))

		await this.broadcastRoomState()
	}

	async broadcastRoomState() {
		let didSomeoneQuit = false
		const roomState = {
			type: 'roomState',
			state: {
				users: [
					...(
						await this.ctx.storage.list<User>({
							prefix: 'session-',
						})
					).values(),
				],
			},
		} satisfies ServerMessage

		const roomStateMessage = JSON.stringify(roomState)

		for (const connection of this.getConnections()) {
			try {
				connection.send(roomStateMessage)
			} catch (err) {
				connection.close(1011, 'Failed to broadcast state')
				await this.ctx.storage.delete(`session-${connection.id}`)
				didSomeoneQuit = true
			}
		}

		if (didSomeoneQuit) {
			// broadcast again to remove the user who quit
			await this.broadcastRoomState()
		}
	}

	async onMessage(
		connection: Connection<User>,
		message: WSMessage
	): Promise<void> {
		try {
			if (typeof message !== 'string') {
				console.warn('Received non-string message')
				return
			}

			let data: ClientMessage = JSON.parse(message)

			switch (data.type) {
				case 'userLeft': {
					connection.close(1000, 'User left')
					this.ctx.storage.delete(`session-${connection.id}`).catch(() => {
						console.warn(
							`Failed to delete session session-${connection.id} on userLeft`
						)
					})
					await this.broadcastRoomState()
					break
				}
				case 'userUpdate': {
					this.ctx.storage.put(
						`session-${connection.id}`,
						JSON.stringify(data.user)
					)
					await this.broadcastRoomState()
					break
				}
				case 'directMessage': {
					const { to, message } = data
					const fromUser = await this.ctx.storage.get<User>(
						`session-${connection.id}`
					)

					for (const otherConnection of this.getConnections<User>()) {
						if (otherConnection.id === to) {
							this.sendMessage(otherConnection, {
								type: 'directMessage',
								from: fromUser!.name,
								message,
							})
							break
						}
					}
					console.warn(
						`User with id "${to}" not found, cannot send DM from "${fromUser!.name}"`
					)
					break
				}
				case 'muteUser': {
					const user = await this.ctx.storage.get<User>(
						`session-${connection.id}`
					)
					let mutedUser = false
					for (const otherConnection of this.getConnections<User>()) {
						if (otherConnection.id === data.id) {
							const otherUser = await this.ctx.storage.get<User>(
								`session-${data.id}`
							)
							this.ctx.storage.put(`session-${data.id}`, {
								...otherUser!,
								tracks: {
									...otherUser!.tracks,
									audioEnabled: false,
								},
							})
							//
							this.sendMessage(otherConnection, {
								type: 'muteMic',
							})

							await this.broadcastRoomState()
							mutedUser = true
							break
						}
					}
					if (!mutedUser) {
						console.warn(
							`User with id "${data.id}" not found, cannot mute user from "${user!.name}"`
						)
					}
					break
				}

				case 'partyserver-ping': {
					// do nothing, this should never be received
					console.warn(
						"Received partyserver-ping from client. You shouldn't be seeing this message. Did you forget to enable hibernation?"
					)
					break
				}
				default: {
					assertNever(data)
					break
				}
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
		// while it makes sense to broadcast immediately on close,
		// it's possible that the websocket just closed for an instant
		//  and will reconnect momentarily.
		// so let's just let the alarm handler do the broadcasting.
		// this.broadcastState()
	}

	onError(): void | Promise<void> {
		// while it makes sense to broadcast immediately on close,
		// it's possible that the websocket just closed for an instant
		//  and will reconnect momentarily.
		// so let's just let the alarm handler do the broadcasting.
		// this.broadcastState()
	}

	async alarm(): Promise<void> {
		// technically we don't need to broadcast state on an alarm,
		// but let's keep it for a while and see if it's useful
		await this.broadcastRoomState()
		if ([...this.getConnections()].length !== 0) {
			this.ctx.storage.setAlarm(Date.now() + 30000)
		}
	}
}
