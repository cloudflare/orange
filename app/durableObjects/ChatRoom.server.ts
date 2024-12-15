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
import invariant from 'tiny-invariant'
import { log } from '~/utils/logging'
import {
	CallsNewSession,
	CallsSession,
	checkNewTracksResponse,
	requestOpenAIService,
	type SessionDescription,
} from '~/utils/openai.server'

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
					audioUnavailable: false,
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

	async broadcastRoomState() {
		let didSomeoneQuit = false
		const meetingId = await this.getMeetingId()
		const roomState = {
			type: 'roomState',
			state: {
				ai: {
					enabled: (await this.ctx.storage.get<boolean>('ai:enabled')) ?? false,
					controllingUser:
						await this.ctx.storage.get<string>('ai:userControlling'),
					connectionPending: await this.ctx.storage.get<boolean>(
						'ai:connectionPending'
					),
					error: await this.ctx.storage.get<string>('ai:error'),
				},
				meetingId,
				users: [...(await this.getUsers()).values()],
			},
		} satisfies ServerMessage

		const roomStateMessage = JSON.stringify(roomState)

		for (const connection of this.getConnections()) {
			try {
				connection.send(roomStateMessage)
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
				case 'heartbeat': {
					await this.ctx.storage.put(`heartbeat-${connection.id}`, Date.now())
					break
				}
				case 'enableAi': {
					await this.ctx.storage.put('ai:connectionPending', true)
					await this.ctx.storage.delete('ai:error')
					this.broadcastRoomState()

					try {
						// This session establishes a PeerConnection between Calls and OpenAI.
						// CallsNewSession thirdparty parameter must be true to be able to connect to an external WebRTC server
						const openAiSession = await CallsNewSession(
							this.env.CALLS_APP_ID,
							this.env.CALLS_APP_SECRET,
							true
						)
						const openAiTracksResponse = await openAiSession.NewTracks({
							// No offer is provided so Calls will generate one for us
							tracks: [
								{
									location: 'local',
									trackName: 'ai-generated-voice',
									// Let it know a sendrecv transceiver is wanted to receive this track instead of a recvonly one
									bidirectionalMediaStream: true,
									// Needed to create an appropriate response
									kind: 'audio',
								},
							],
						})
						checkNewTracksResponse(openAiTracksResponse, true)

						invariant(this.env.OPENAI_MODEL_ENDPOINT)
						invariant(this.env.OPEN_AI_KEY)

						// The Calls's offer is sent to OpenAI
						const openaiAnswer = await requestOpenAIService(
							openAiTracksResponse.sessionDescription ||
								({} as SessionDescription),
							this.env.OPEN_AI_KEY,
							this.env.OPENAI_MODEL_ENDPOINT
						)

						console.log('OpenAI answer', openaiAnswer)

						// And the negotiation is completed by setting the answer from OpenAI
						const renegotiationResponse =
							await openAiSession.Renegotiate(openaiAnswer)
						console.log('renegotiationResponse', renegotiationResponse)

						console.log('set ai:sessionId', openAiSession.sessionId)
						await this.ctx.storage.put('ai:sessionId', openAiSession.sessionId)
						await this.ctx.storage.put('ai:enabled', true)
						await this.ctx.storage.put('ai:connectionPending', false)
						this.broadcastRoomState()

						break
					} catch (error) {
						console.error(error)
						await this.ctx.storage.put('ai:connectionPending', false)
						await this.ctx.storage.put(
							'ai:error',
							'Error establishing connection with AI'
						)
						this.broadcastRoomState()
						break
					}
				}
				case 'requestAiControl': {
					const aiSessionId = await this.ctx.storage.get<string>('ai:sessionId')
					invariant(aiSessionId)
					const openAiSession = new CallsSession(
						aiSessionId,
						{
							Authorization: `Bearer ${this.env.CALLS_APP_SECRET}`,
							'Content-Type': 'application/json',
						},
						`https://rtc.live.cloudflare.com/apps/${this.env.CALLS_APP_ID}`
					)

					const userAiSessionId = await this.ctx.storage.get<string>(
						`ai:${connection.id}:sessionId`
					)
					invariant(userAiSessionId)

					console.log({ aiSessionId, userAiSessionId })
					console.log('starting exchangeStepTwo')
					const exchangeStepTwo = await openAiSession.NewTracks({
						tracks: [
							{
								location: 'remote',
								sessionId: userAiSessionId,
								trackName: `user-${connection.id}-mic`,
								// Let Calls to find out the actual mid value
								mid: `#ai-generated-voice`,
							},
						],
					})
					console.log('exchangeStepTwo result', exchangeStepTwo)
					checkNewTracksResponse(exchangeStepTwo)

					this.ctx.storage.put('ai:userControlling', connection.id)
					this.broadcastRoomState()
					break
				}
				case 'relenquishAiControl': {
					this.ctx.storage.delete('ai:userControlling')
					this.broadcastRoomState()
					break
				}
				case 'establishAiPeerConnection': {
					const { sdp } = data
					// This session establishes a PeerConnection between the end-user and Calls.
					const userAiSession = await CallsNewSession(
						this.env.CALLS_APP_ID,
						this.env.CALLS_APP_SECRET
					)
					const newTracksResponseA = await userAiSession.NewTracks({
						sessionDescription: { sdp, type: 'offer' },
						tracks: [
							{
								location: 'local',
								trackName: `user-${connection.id}-mic`,
								// Let it know a sendrecv transceiver is wanted to receive this track instead of a recvonly one
								bidirectionalMediaStream: true,
								// Needed to create an appropriate response
								kind: 'audio',
								mid: '0',
							},
						],
					})
					console.log('newTracksResponseA', newTracksResponseA)
					checkNewTracksResponse(newTracksResponseA, true)

					console.log(
						`set ai:${connection.id}:sessionId`,
						userAiSession.sessionId
					)
					await this.ctx.storage.put(
						`ai:${connection.id}:sessionId`,
						userAiSession.sessionId
					)

					this.sendMessage(connection, {
						type: 'aiSdp',
						sdp: newTracksResponseA.sessionDescription.sdp,
						aiSessionId: await this.ctx.storage.get('ai:sessionId'),
						userSessionid: userAiSession.sessionId,
					})

					const aiSessionId = await this.ctx.storage.get<string>('ai:sessionId')
					invariant(aiSessionId)

					console.log('aiSessionId', aiSessionId)
					console.log('connection.id', connection.id)

					const exchangeStepOne = await userAiSession.NewTracks({
						// Session A is the PeerConnection from Calls to the end-user.
						// The following request instructs Calls to pull the 'ai-generated-voice' from session B and to send
						// it back to the end-user through an existing transceiver that was created to
						// publish the user-mic track at the beginning
						//
						//
						//                 PeerConnection A
						// end-user <-> [sendrecv transceiver] <---- ai-generated-voice (new!)
						//                mid=0 (#user-mic)   \
						//                                     `--> user-mic
						tracks: [
							{
								location: 'remote',
								sessionId: aiSessionId,
								trackName: 'ai-generated-voice',
								// We may not know the exact mid value associated to the user-mic transceiver
								// so instead of providing it, let Calls to resolve it for you
								mid: `#user-${connection.id}-mic`,
							},
						],
					})
					console.log(
						'Checking new tracks response after exchangeStepOne',
						exchangeStepOne
					)
					checkNewTracksResponse(exchangeStepOne)

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
		if (this.db) {
			// stamp meeting as ended
			await this.db
				.update(Meetings)
				.set({
					ended: sql`CURRENT_TIMESTAMP`,
				})
				.where(eq(Meetings.id, meetingId))
		}
		await this.ctx.storage.deleteAll()
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
