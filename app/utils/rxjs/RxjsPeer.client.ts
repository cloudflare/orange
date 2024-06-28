import {
	Observable,
	combineLatest,
	distinctUntilChanged,
	filter,
	from,
	fromEvent,
	map,
	share,
	shareReplay,
	switchMap,
	take,
	tap,
	withLatestFrom,
} from 'rxjs'
import invariant from 'tiny-invariant'
import { BulkRequestDispatcher, FIFOScheduler } from '../Peer.utils'
import type {
	RenegotiationResponse,
	TrackObject,
	TracksResponse,
} from '../callsTypes'

interface PeerConfig {
	appId: string
	token: string
	apiBase: string
}

export class RxjsPeer {
	peerConnection$: Observable<RTCPeerConnection>
	session$: Observable<{
		peerConnection: RTCPeerConnection
		sessionId: string
	}>
	peerConnectionState$: Observable<RTCPeerConnectionState>
	config: PeerConfig

	authHeaders() {
		return {
			Authorization: `Bearer ${this.config.token}`,
		}
	}

	constructor(config: PeerConfig) {
		this.config = config
		this.peerConnection$ = new Observable<RTCPeerConnection>((subscribe) => {
			let peerConnection: RTCPeerConnection
			const setup = () => {
				peerConnection?.close()
				peerConnection = createPeerConnection()
				peerConnection.addEventListener('connectionstatechange', () => {
					if (
						peerConnection.connectionState === 'failed' ||
						peerConnection.connectionState === 'closed'
					) {
						subscribe.next(setup())
					}
				})

				// TODO: Remove this
				Object.assign(window, {
					explode: () => {
						console.debug('💥 Closing connection')
						peerConnection.close()
						peerConnection.dispatchEvent(new Event('connectionstatechange'))
					},
				})

				return peerConnection
			}

			subscribe.next(setup())

			return () => {
				peerConnection.close()
			}
		})

		this.session$ = this.peerConnection$.pipe(
			// TODO: Convert the promise based session creation here
			// into an observable that will close the session in cleanup
			switchMap((pc) => from(this.createSession(pc))),
			// we want new subscribers to receive the session right away
			shareReplay({
				bufferSize: 1,
				refCount: true,
			})
		)

		this.peerConnectionState$ = this.peerConnection$.pipe(
			switchMap((peerConnection) =>
				fromEvent(
					peerConnection,
					'connectionstatechange',
					() => peerConnection.connectionState
				)
			),
			share()
		)
	}

	taskScheduler = new FIFOScheduler()
	pushTrackDispatcher = new BulkRequestDispatcher<
		{
			trackName: string
			transceiver: RTCRtpTransceiver
		},
		{ tracks: TrackObject[] }
	>(32)
	pullTrackDispatcher = new BulkRequestDispatcher<
		TrackObject,
		{
			trackMap: Map<
				TrackObject,
				{ resolvedTrack: Promise<MediaStreamTrack>; mid: string }
			>
		}
	>(32)
	closeTrackDispatcher = new BulkRequestDispatcher(32)

	async createSession(peerConnection: RTCPeerConnection) {
		console.debug('🆕 creating new session')
		const { appId, apiBase, token } = this.config
		// create an offer and set it as the local description
		await peerConnection.setLocalDescription(await peerConnection.createOffer())
		const { sessionId, sessionDescription } = await fetch(
			`${apiBase}/${appId}/sessions/new`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					sessionDescription: peerConnection.localDescription,
				}),
			}
		).then((res) => res.json() as any)
		const connected = new Promise((res, rej) => {
			// timeout after 5s
			setTimeout(rej, 5000)
			const iceConnectionStateChangeHandler = () => {
				if (peerConnection.iceConnectionState === 'connected') {
					peerConnection.removeEventListener(
						'iceconnectionstatechange',
						iceConnectionStateChangeHandler
					)
					res(undefined)
				}
			}
			peerConnection.addEventListener(
				'iceconnectionstatechange',
				iceConnectionStateChangeHandler
			)
		})

		// Once both local and remote descriptions are set, the ICE process begins
		await peerConnection.setRemoteDescription(sessionDescription)
		// Wait until the peer connection's iceConnectionState is "connected"
		await connected
		return { peerConnection, sessionId }
	}

	#pushTrackInBulk(
		peerConnection: RTCPeerConnection,
		transceiver: RTCRtpTransceiver,
		sessionId: string,
		trackName: string
	): Observable<TrackObject> {
		return new Observable<TrackObject>((subscribe) => {
			let pushedTrackPromise: Promise<unknown>
			// we're doing this in a timeout so that we can bail if the observable
			// is unsubscribed from immediately after subscribing. This will prevent
			// React's StrictMode from causing extra API calls to push/pull tracks.
			const timeout = setTimeout(() => {
				console.debug('📤 pushing track ', trackName)
				pushedTrackPromise = this.pushTrackDispatcher
					.doBulkRequest({ trackName, transceiver }, (tracks) =>
						this.taskScheduler.schedule(async () => {
							await peerConnection.setLocalDescription(
								await peerConnection.createOffer()
							)

							const response = await fetch(
								`${this.config.apiBase}/${this.config.appId}/sessions/${sessionId}/tracks/new`,
								{
									method: 'POST',
									headers: this.authHeaders(),
									body: JSON.stringify({
										sessionDescription: {
											sdp: peerConnection.localDescription?.sdp,
											type: 'offer',
										},
										tracks: tracks.map(({ trackName, transceiver }) => ({
											trackName,
											mid: transceiver.mid,
											location: 'local',
										})),
									}),
								}
							).then((res) => res.json() as Promise<TracksResponse>)
							invariant(response.tracks !== undefined)
							if (!response.errorCode) {
								await peerConnection.setRemoteDescription(
									new RTCSessionDescription(response.sessionDescription)
								)
							}

							return {
								tracks: response.tracks,
							}
						})
					)
					.then(({ tracks }) => {
						const trackData = tracks.find((t) => t.mid === transceiver.mid)
						if (trackData) {
							subscribe.next({
								...trackData,
								sessionId,
								location: 'remote',
							})
						} else {
							subscribe.error(new Error('Missing TrackData'))
						}
					})
					.catch((err) => subscribe.error(err))
			})

			return () => {
				clearTimeout(timeout)
				pushedTrackPromise?.then(() => {
					this.taskScheduler.schedule(async () => {
						console.debug('🔚 Closing pushed track ', trackName)
						return this.closeTrack(peerConnection, transceiver.mid, sessionId)
					})
				})
			}
		})
	}

	pushTrack(track$: Observable<MediaStreamTrack>): Observable<TrackObject> {
		// we want a single id for this connection, but we need to wait for
		// the first track to show up before we can proceed, so we
		const stableId$ = track$.pipe(
			take(1),
			map(() => crypto.randomUUID())
		)

		const transceiver$ = combineLatest([stableId$, this.session$]).pipe(
			withLatestFrom(track$),
			map(([[stableId, session], track]) => {
				const transceiver = session.peerConnection.addTransceiver(track, {
					direction: 'sendonly',
				})
				console.debug('🌱 creating transceiver!')
				return {
					transceiver,
					stableId,
					session,
				}
			}),
			shareReplay({
				refCount: true,
				bufferSize: 1,
			})
		)

		const pushedTrackData$ = transceiver$.pipe(
			switchMap(
				({ session: { peerConnection, sessionId }, transceiver, stableId }) =>
					this.#pushTrackInBulk(
						peerConnection,
						transceiver,
						sessionId,
						stableId
					)
			)
		)

		return combineLatest([pushedTrackData$, transceiver$, track$]).pipe(
			tap(([_trackData, { transceiver }, track]) => {
				if (transceiver.sender.transport !== null) {
					console.debug('♻︎ replacing track')
					transceiver.sender.replaceTrack(track)
				}
			}),
			map(([trackData]) => trackData),
			shareReplay({
				refCount: true,
				bufferSize: 1,
			})
		)
	}

	#pullTrackInBulk(
		peerConnection: RTCPeerConnection,
		sessionId: string,
		trackData: TrackObject
	): Observable<MediaStreamTrack> {
		let mid = ''
		return new Observable((subscribe) => {
			let pulledTrackPromise: Promise<unknown>
			// we're doing this in a timeout so that we can bail if the observable
			// is unsubscribed from immediately after subscribing. This will prevent
			// React's StrictMode from causing extra API calls to push/pull tracks.
			const timeout = setTimeout(() => {
				console.debug('📥 pulling track ', trackData.trackName)
				pulledTrackPromise = this.pullTrackDispatcher
					.doBulkRequest(trackData, (tracks) =>
						this.taskScheduler.schedule(async () => {
							const newTrackResponse: TracksResponse = await fetch(
								`${this.config.apiBase}/${this.config.appId}/sessions/${sessionId}/tracks/new`,
								{
									method: 'POST',
									headers: this.authHeaders(),
									body: JSON.stringify({
										tracks,
									}),
								}
							).then((res) => res.json() as Promise<TracksResponse>)
							if (newTrackResponse.errorCode) {
								throw new Error(newTrackResponse.errorDescription)
							}
							invariant(newTrackResponse.tracks)
							const trackMap = tracks.reduce((acc, track) => {
								const pulledTrackData = newTrackResponse.tracks?.find(
									(t) =>
										t.trackName === track.trackName &&
										t.sessionId === track.sessionId
								)

								if (pulledTrackData && pulledTrackData.mid) {
									acc.set(track, {
										mid: pulledTrackData.mid,
										resolvedTrack: resolveTrack(
											peerConnection,
											(t) => t.mid === pulledTrackData.mid
										),
									})
								}

								return acc
							}, new Map<TrackObject, { resolvedTrack: Promise<MediaStreamTrack>; mid: string }>())

							if (newTrackResponse.requiresImmediateRenegotiation) {
								await peerConnection.setRemoteDescription(
									new RTCSessionDescription(newTrackResponse.sessionDescription)
								)
								const answer = await peerConnection.createAnswer()
								await peerConnection.setLocalDescription(answer)

								const renegotiationResponse = await fetch(
									`${this.config.apiBase}/${this.config.appId}/sessions/${sessionId}/renegotiate`,
									{
										method: 'PUT',
										body: JSON.stringify({
											sessionDescription: {
												type: 'answer',
												sdp: peerConnection.currentLocalDescription?.sdp,
											},
										}),
										headers: this.authHeaders(),
									}
								).then((res) => res.json() as Promise<RenegotiationResponse>)
								if (renegotiationResponse.errorCode)
									throw new Error(renegotiationResponse.errorDescription)
							}

							return { trackMap }
						})
					)
					.then(({ trackMap }) => {
						const trackInfo = trackMap.get(trackData)

						if (trackInfo) {
							trackInfo.resolvedTrack
								.then((track) => {
									mid = trackInfo.mid
									subscribe.next(track)
								})
								.catch((err) => subscribe.error(err))
						} else {
							subscribe.error(new Error('Missing Track Info'))
						}
						return trackData.trackName
					})
			})

			return () => {
				clearTimeout(timeout)
				pulledTrackPromise?.then((trackName) => {
					if (mid) {
						console.debug('🔚 Closing pulled track ', trackName)
						this.taskScheduler.schedule(async () =>
							this.closeTrack(peerConnection, mid, sessionId)
						)
					}
				})
			}
		})
	}

	pullTrack(trackData$: Observable<TrackObject>): Observable<MediaStreamTrack> {
		return combineLatest([
			this.session$,
			trackData$.pipe(
				// only necessary when pulling a track that was pushed locally to avoid
				// re-pulling when pushed track transceiver replaces track
				distinctUntilChanged((x, y) => JSON.stringify(x) === JSON.stringify(y))
			),
		]).pipe(
			// avoid re-pulling if track data changed before connection state is connected
			// should only really be necessary if pulling a track that was pushed locally
			filter(
				([{ peerConnection }]) => peerConnection.connectionState === 'connected'
			),
			switchMap(([{ peerConnection, sessionId }, trackData]) =>
				this.#pullTrackInBulk(peerConnection, sessionId, trackData)
			)
		)
	}

	async closeTrack(
		peerConnection: RTCPeerConnection,
		mid: string | null,
		sessionId: string
	) {
		// TODO: Close tracks in bulk
		const { appId, token, apiBase } = this.config
		const transceiver = peerConnection
			.getTransceivers()
			.find((t) => t.mid === mid)
		if (
			peerConnection.connectionState !== 'connected' ||
			transceiver === undefined
		) {
			return
		}
		transceiver.direction = 'inactive'
		await peerConnection.setLocalDescription(await peerConnection.createOffer())
		const requestBody = {
			tracks: [{ mid: transceiver.mid }],
			sessionDescription: {
				sdp: peerConnection.localDescription?.sdp,
				type: 'offer',
			},
			force: false,
		}
		const response = await fetch(
			`${apiBase}/${appId}/sessions/${sessionId}/tracks/close`,
			{
				method: 'PUT',
				body: JSON.stringify(requestBody),
				headers: {
					Authorization: `Bearer ${token}`,
				},
			}
		).then((res) => res.json() as Promise<TracksResponse>)
		await peerConnection.setRemoteDescription(
			new RTCSessionDescription(response.sessionDescription)
		)
	}
}

function createPeerConnection(
	configuration: RTCConfiguration = {
		iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
		bundlePolicy: 'max-bundle',
	}
) {
	const pc = new RTCPeerConnection(configuration)

	pc.addTransceiver('audio', {
		direction: 'inactive',
	})

	return pc
}

async function resolveTrack(
	peerConnection: RTCPeerConnection,
	compare: (t: RTCRtpTransceiver) => boolean,
	timeout = 5000
) {
	return new Promise<MediaStreamTrack>((resolve, reject) => {
		setTimeout(reject, timeout)
		const handler = () => {
			const transceiver = peerConnection.getTransceivers().find(compare)
			if (transceiver) {
				resolve(transceiver.receiver.track)
				peerConnection.removeEventListener('track', handler)
			}
		}

		peerConnection.addEventListener('track', handler)
	})
}
