export default function populateTraceLink(
	sessionID: string,
	traceLink?: string
) {
	if (!traceLink) return undefined
	const url = new URL(traceLink)

	const end = +new Date()
	const start = end - 3600000
	url.searchParams.set('start', (start * 1000).toString())
	url.searchParams.set('end', (end * 1000).toString())
	url.searchParams.set('tags', JSON.stringify({ 'peer.SessionID': sessionID }))

	return url.toString()
}
