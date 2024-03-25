// `handleErrors()` is a little utility function that can wrap an HTTP request handler in a
// try/catch and return errors to the client. You probably wouldn't want to use this in production
// code but it is convenient when debugging and iterating.
export async function handleErrors(request: Request, func: () => Promise<any>) {
	try {
		return await func()
	} catch (err) {
		if (!(err instanceof Error)) throw err
		if (request.headers.get('Upgrade') == 'websocket') {
			// Annoyingly, if we return an HTTP error in response to a WebSocket request, Chrome devtools
			// won't show us the response body! So... let's send a WebSocket response with an error
			// frame instead.
			let pair = new WebSocketPair()
			;(pair[1] as any).accept()
			pair[1].send(JSON.stringify({ error: err.stack }))
			pair[1].close(1011, 'Uncaught exception during session setup')
			return new Response(null, { status: 101, webSocket: pair[0] })
		} else {
			return new Response(err.stack, { status: 500 })
		}
	}
}
