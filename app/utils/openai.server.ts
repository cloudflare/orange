export interface SessionDescription {
	sdp: string
	type: string
}

interface NewSessionResponse {
	sessionId: string
}

interface NewTrackResponse {
	trackName: string
	mid: string
	errorCode?: string
	errorDescription?: string
}

interface NewTracksResponse {
	tracks: NewTrackResponse[]
	sessionDescription?: SessionDescription
	errorCode?: string
	errorDescription?: string
}

export class CallsSession {
	sessionId: string
	headers: any
	endpoint: string
	params: URLSearchParams
	constructor(
		sessionId: string,
		headers: any,
		endpoint: string,
		apiExtraParams?: string,
		meetingId?: string
	) {
		this.sessionId = sessionId
		this.headers = headers
		this.endpoint = endpoint
		this.params = new URLSearchParams(apiExtraParams)
		if (meetingId) {
			this.params.set('correlationId', meetingId)
		}
	}
	async NewTracks(body: any): Promise<NewTracksResponse> {
		const newTracksURL = new URL(
			`${this.endpoint}/sessions/${this.sessionId}/tracks/new?${this.params.toString()}`
		)
		const newTracksResponse = (await fetch(newTracksURL.href, {
			method: 'POST',
			headers: this.headers,
			body: JSON.stringify(body),
		}).then(async (res) => {
			console.log(await res.clone().text())
			return res.json()
		})) as NewTracksResponse
		return newTracksResponse
	}
	async Renegotiate(sdp: SessionDescription) {
		const renegotiateBody = {
			sessionDescription: sdp,
		}
		const renegotiateURL = new URL(
			`${this.endpoint}/sessions/${this.sessionId}/renegotiate?${this.params.toString()}`
		)
		return fetch(renegotiateURL.href, {
			method: 'PUT',
			headers: this.headers,
			body: JSON.stringify(renegotiateBody),
		})
	}
}

const baseURL = 'https://rtc.live.cloudflare.com/apps'

export async function CallsNewSession(
	appID: string,
	appToken: string,
	apiExtraParams?: string,
	meetingId?: string,
	thirdparty = false
): Promise<CallsSession> {
	const headers = {
		Authorization: `Bearer ${appToken}`,
		'Content-Type': 'application/json',
	}
	const endpoint = `${baseURL}/${appID}`
	const params = new URLSearchParams(apiExtraParams)
	if (meetingId) {
		params.set('correlationId', meetingId)
	}
	const newSessionURL = new URL(`${endpoint}/sessions/new?${params.toString()}`)
	if (thirdparty) {
		newSessionURL.searchParams.set('thirdparty', 'true')
	}

	console.log(`Request to: ${newSessionURL.href}`)
	const sessionResponse = (await fetch(newSessionURL.href, {
		method: 'POST',
		headers: headers,
	})
		.then(async (res) => {
			console.log(await res.clone().text())
			return res
		})

		.then((res) => res.json())) as NewSessionResponse
	return new CallsSession(
		sessionResponse.sessionId,
		headers,
		endpoint,
		apiExtraParams,
		meetingId
	)
}

export function checkNewTracksResponse(
	newTracksResponse: NewTracksResponse,
	sdpExpected: boolean = false
): asserts newTracksResponse is {
	tracks: NewTrackResponse[]
	sessionDescription: SessionDescription
} {
	if (newTracksResponse.errorCode) {
		throw newTracksResponse.errorDescription
	}
	if (newTracksResponse.tracks[0].errorDescription) {
		throw newTracksResponse.tracks[0].errorDescription
	}
	if (sdpExpected && newTracksResponse.sessionDescription == null) {
		throw 'empty sdp from Calls for session A'
	}
}

export async function requestOpenAIService(
	offer: SessionDescription,
	openAiKey: string,
	openAiModelEndpoint: string,
	searchParams?: URLSearchParams
): Promise<SessionDescription> {
	console.log(`Request to: ${openAiModelEndpoint}`)
	const endpointURL = new URL(openAiModelEndpoint)
	endpointURL.search = searchParams?.toString() ?? ''
	const response = await fetch(endpointURL.href, {
		method: 'POST',
		body: offer.sdp,
		headers: {
			Authorization: `Bearer ${openAiKey}`,
			'Content-Type': 'application/sdp',
		},
	})

	if (response.status >= 400) {
		const errMessage = await response.text()
		console.error('Error from OpenAI: ', errMessage)
		throw new Error(errMessage)
	}
	const answerSDP = await response.text()
	return { type: 'answer', sdp: answerSDP } as SessionDescription
}
