import type { Env } from '~/types/Env'
import type { ClientMessage, ServerMessage, User } from '~/types/Messages'
import { assertError } from '~/utils/assertError'
import assertNever from '~/utils/assertNever'
import { assertNonNullable } from '~/utils/assertNonNullable'
import getUsername from '~/utils/getUsername.server'

import { eq, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import {
	Server,
	type Connection,
	type ConnectionContext,
	type WSMessage,
} from 'partyserver'
import { getDb, Meetings } from 'schema'
import { log } from '~/utils/logging'

const alarmInterval = 15_000

/**
 * The ChatRoom Durable Object Class
 *
 * ChatRoom implements a Durable Object that coordinates an
 * individual chat room. Participants connect to the room using
 * WebSockets, and the room broadcasts messages from each participant
 * to all others.
 */
export class ChatRoom extends Server<Env> {
	env: Env
	db: DrizzleD1Database<Record<string, never>> | null

	// static options = { hibernate: true }

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		this.env = env
		this.db = getDb(this)
	}

	// a small typesafe wrapper around connection.send
	sendMessage<M extends ServerMessage>(connection: Connection, message: M) {
		connection.send(JSON.stringify(message))
	}

	async onStart(): Promise<void> {
		const meetingId = await this.getMeetingId()
		log({ eventName: 'onStart', meetingId })
		this.db = getDb(this)
		// TODO: make this a part of partyserver
		// this.ctx.setWebSocketAutoResponse(
		// 	new WebSocketRequestResponsePair(
		// 		JSON.stringify({ type: 'partyserver-ping' }),
		// 		JSON.stringify({ type: 'partyserver-pong' })
		// 	)
		// )
	}

	async onConnect(
		connection: Connection<User>,
		ctx: ConnectionContext
	): Promise<void> {
		// let's start the periodic alarm if it's not already started
		if (!(await this.ctx.storage.getAlarm())) {
			// start the alarm to broadcast state every 30 seconds
			this.ctx.storage.setAlarm(Date.now() + alarmInterval)
		}

		const username = await getUsername(ctx.request)
		assertNonNullable(username)

		let user = await this.ctx.storage.get<User>(`session-${connection.id}`)
		const foundInStorage = user !== undefined
		if (!foundInStorage) {
			user = {
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
		}

		// store the user's data in storage
		await this.ctx.storage.put(`session-${connection.id}`, user)
		await this.ctx.storage.put(`heartbeat-${connection.id}`, Date.now())
		await this.trackPeakUserCount()
		await this.broadcastRoomState()
		const meetingId = await this.getMeetingId()
		log({
			eventName: 'onConnect',
			meetingId,
			foundInStorage,
			connectionId: connection.id,
		})
	}

	async trackPeakUserCount() {
		let meetingId = await this.getMeetingId()
		const meeting = meetingId
			? await this.getMeeting(meetingId)
			: await this.createMeeting()
		await this.cleanupOldConnections()
		if (this.db) {
			if (!meeting) return
			if (meeting.ended !== null) {
				await this.db
					.update(Meetings)
					.set({ ended: null })
					.where(eq(Meetings.id, meeting.id))
			}

			const previousCount = meeting.peakUserCount
			const userCount = (await this.getUsers()).size
			if (userCount > previousCount) {
				await this.db
					.update(Meetings)
					.set({
						peakUserCount: userCount,
					})
					.where(eq(Meetings.id, meeting.id))
			}
		}
		return meetingId
	}

	async getMeetingId() {
		return this.ctx.storage.get<string>('meetingId')
	}

	async createMeeting() {
		const meetingId = crypto.randomUUID()
		await this.ctx.storage.put('meetingId', meetingId)
		log({ eventName: 'startingMeeting', meetingId })
		if (this.db) {
			return this.db
				.insert(Meetings)
				.values({
					id: meetingId,
					peakUserCount: 1,
				})
				.returning()
				.then(([m]) => m)
		}
	}

	async getMeeting(meetingId: string) {
		if (!this.db) return null
		const [meeting] = await this.db
			.select()
			.from(Meetings)
			.where(eq(Meetings.id, meetingId))

		return meeting
	}

	async broadcastMessage(
		message: ServerMessage,
		excludedConnection?: Connection
	) {
		let didSomeoneQuit = false
		const meetingId = await this.getMeetingId()
		const messageAsString = JSON.stringify(message)

		for (const connection of this.getConnections()) {
			try {
				if (excludedConnection && connection === excludedConnection) continue
				connection.send(messageAsString)
			} catch (err) {
				connection.close(1011, 'Failed to broadcast state')
				log({
					eventName: 'errorBroadcastingToUser',
					meetingId,
					connectionId: connection.id,
				})
				await this.ctx.storage.delete(`session-${connection.id}`)
				didSomeoneQuit = true
			}
		}

		if (didSomeoneQuit) {
			// broadcast again to remove the user who quit
			await this.broadcastRoomState()
		}
	}

	async broadcastRoomState() {
		const meetingId = await this.getMeetingId()
		const roomState = {
			type: 'roomState',
			state: {
				meetingId,
				users: [...(await this.getUsers()).values()],
			},
		} satisfies ServerMessage
		return this.broadcastMessage(roomState)
	}

	async onClose(
		connection: Connection,
		code: number,
		reason: string,
		wasClean: boolean
	) {
		const meetingId = await this.getMeetingId()
		log({
			eventName: 'onClose',
			meetingId,
			connectionId: connection.id,
			code,
			reason,
			wasClean,
		})
	}

	async onMessage(
		connection: Connection<User>,
		message: WSMessage
	): Promise<void> {
		try {
			const meetingId = await this.getMeetingId()
			if (typeof message !== 'string') {
				console.warn('Received non-string message')
				return
			}

			let data: ClientMessage = JSON.parse(message)

			switch (data.type) {
				case 'userLeft': {
					connection.close(1000, 'User left')
					this.userLeftNotification(connection.id)
					await this.ctx.storage
						.delete(`session-${connection.id}`)
						.catch(() => {
							console.warn(
								`Failed to delete session session-${connection.id} on userLeft`
							)
						})
					await this.ctx.storage
						.delete(`heartbeat-${connection.id}`)
						.catch(() => {
							console.warn(
								`Failed to delete session session-heartbeat-${connection.id} on userLeft`
							)
						})
					log({ eventName: 'userLeft', meetingId, connectionId: connection.id })

					await this.broadcastRoomState()
					break
				}
				case 'userUpdate': {
					this.ctx.storage.put(`session-${connection.id}`, data.user)
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
							await this.ctx.storage.put(`session-${data.id}`, {
								...otherUser!,
								tracks: {
									...otherUser!.tracks,
									audioEnabled: false,
								},
							})
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
				case 'e2eeMlsMessage': {
					// forward as-is
					this.broadcastMessage(data, connection)
					break
				}
				case 'heartbeat': {
					await this.ctx.storage.put(`heartbeat-${connection.id}`, Date.now())
					break
				}
				default: {
					assertNever(data)
					break
				}
			}
		} catch (error) {
			const meetingId = await this.getMeetingId()
			log({
				eventName: 'errorHandlingMessage',
				meetingId,
				connectionId: connection.id,
				error,
			})
			assertError(error)
			// TODO: should this even be here?
			// Report any exceptions directly back to the client. As with our handleErrors() this
			// probably isn't what you'd want to do in production, but it's convenient when testing.
			this.sendMessage(connection, {
				type: 'error',
				error: error.stack,
			} satisfies ServerMessage)
		}
	}

	onError(connection: Connection, error: unknown): void | Promise<void> {
		log({
			eventName: 'onErrorHandler',
			error,
		})
		return this.getMeetingId().then((meetingId) => {
			log({
				eventName: 'onErrorHandlerDetails',
				meetingId,
				connectionId: connection.id,
				error,
			})
			this.broadcastRoomState()
		})
	}

	getUsers() {
		return this.ctx.storage.list<User>({
			prefix: 'session-',
		})
	}

	async endMeeting(meetingId: string) {
		log({ eventName: 'endingMeeting', meetingId })
		await this.ctx.storage.delete('meetingId')
		if (this.db) {
			// stamp meeting as ended
			await this.db
				.update(Meetings)
				.set({
					ended: sql`CURRENT_TIMESTAMP`,
				})
				.where(eq(Meetings.id, meetingId))
		}
	}

	userLeftNotification(id: string) {
		this.broadcastMessage({
			type: 'userLeftNotification',
			id,
		})
	}

	async cleanupOldConnections() {
		const meetingId = await this.getMeetingId()
		if (!meetingId) log({ eventName: 'meetingIdNotFoundInCleanup' })
		const now = Date.now()
		const users = await this.getUsers()
		let removedUsers = 0
		const connections = [...this.getConnections()]

		for (const [key, user] of users) {
			const connectionId = key.replace('session-', '')
			const heartbeat = await this.ctx.storage.get<number>(
				`heartbeat-${connectionId}`
			)
			if (heartbeat === undefined || heartbeat + alarmInterval < now) {
				this.userLeftNotification(connectionId)
				removedUsers++
				await this.ctx.storage.delete(key).catch(() => {
					console.warn(
						`Failed to delete session ${key} in cleanupOldConnections`
					)
				})

				const connection = connections.find((c) => c.id === connectionId)
				if (connection) {
					connection.close(1011)
				}
				log({ eventName: 'userTimedOut', connectionId: user.id, meetingId })
			}
		}

		const activeUserCount = (await this.getUsers()).size

		if (meetingId && activeUserCount === 0) {
			this.endMeeting(meetingId)
		} else if (removedUsers > 0) {
			this.broadcastRoomState()
		}

		return activeUserCount
	}

	async alarm(): Promise<void> {
		const meetingId = await this.getMeetingId()
		log({ eventName: 'alarm', meetingId })
		const activeUserCount = await this.cleanupOldConnections()
		await this.broadcastRoomState()
		if (activeUserCount !== 0) {
			this.ctx.storage.setAlarm(Date.now() + alarmInterval)
		}
	}
}
