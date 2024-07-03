import type { Env } from '~/types/Env'

export async function getIceServers({
	TURN_SERVICE_ID,
	TURN_SERVICE_TOKEN,
}: Env): Promise<undefined | RTCIceServer[]> {
	if (TURN_SERVICE_TOKEN === undefined || TURN_SERVICE_ID === undefined) return

	return fetch(
		`https://rtc.live.cloudflare.com/v1/turn/keys/${TURN_SERVICE_ID}/credentials/generate`,
		{
			method: 'POST',
			body: JSON.stringify({ ttl: 86400 }),
			headers: {
				Authorization: `Bearer ${TURN_SERVICE_TOKEN}`,
			},
		}
	)
		.then(
			(res) =>
				res.json() as Promise<{
					iceServers: RTCIceServer
				}>
		)
		.then(({ iceServers }) => [iceServers])
}
