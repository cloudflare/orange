import type { AppLoadContext } from '@remix-run/cloudflare'

export async function handleApiRequest(
	path: string[],
	request: Request,
	env: AppLoadContext
) {
	// We've received at API request. Route the request based on the path.

	switch (path[0]) {
		case 'room': {
			// Request for `/api/room/...`.

			if (!path[1]) {
				// The request is for just "/api/room", with no ID.
				if (request.method == 'POST') {
					// POST to /api/room creates a private room.
					//
					// Incidentally, this code doesn't actually store anything. It just generates a valid
					// unique ID for this namespace. Each durable object namespace has its own ID space, but
					// IDs from one namespace are not valid for any other.
					//
					// The IDs returned by `newUniqueId()` are unguessable, so are a valid way to implement
					// "anyone with the link can access" sharing. Additionally, IDs generated this way have
					// a performance benefit over IDs generated from names: When a unique ID is generated,
					// the system knows it is unique without having to communicate with the rest of the
					// world -- i.e., there is no way that someone in the UK and someone in New Zealand
					// could coincidentally create the same ID at the same time, because unique IDs are,
					// well, unique!
					let id = env.rooms.newUniqueId()
					return new Response(id.toString(), {
						headers: { 'Access-Control-Allow-Origin': '*' },
					})
				} else {
					// If we wanted to support returning a list of public rooms, this might be a place to do
					// it. The list of room names might be a good thing to store in KV, though a singleton
					// Durable Object is also a possibility as long as the Cache API is used to cache reads.
					// (A caching layer would be needed because a single Durable Object is single-threaded,
					// so the amount of traffic it can handle is limited. Also, caching would improve latency
					// for users who don't happen to be located close to the singleton.)
					//
					// For this demo, though, we're not implementing a public room list, mainly because
					// inevitably some trolls would probably register a bunch of offensive room names. Sigh.
					return new Response('Method not allowed', { status: 405 })
				}
			}

			// OK, the request is for `/api/room/<name>/...`. It's time to route to the Durable Object
			// for the specific room.
			let name = path[1]

			// Each Durable Object has a 256-bit unique ID. IDs can be derived from string names, or
			// chosen randomly by the system.
			let id
			if (name.match(/^[0-9a-f]{64}$/)) {
				// The name is 64 hex digits, so let's assume it actually just encodes an ID. We use this
				// for private rooms. `idFromString()` simply parses the text as a hex encoding of the raw
				// ID (and verifies that this is a valid ID for this namespace).
				id = env.rooms.idFromString(name)
			} else if (name.length <= 32) {
				// Treat as a string room name (limited to 32 characters). `idFromName()` consistently
				// derives an ID from a string.
				id = env.rooms.idFromName(name)
			} else {
				return new Response('Name too long', { status: 404 })
			}

			// Get the Durable Object stub for this room! The stub is a client object that can be used
			// to send messages to the remote Durable Object instance. The stub is returned immediately;
			// there is no need to await it. This is important because you would not want to wait for
			// a network round trip before you could start sending requests. Since Durable Objects are
			// created on-demand when the ID is first used, there's nothing to wait for anyway; we know
			// an object will be available somewhere to receive our requests.
			let roomObject = env.rooms.get(id)

			// Compute a new URL with `/api/room/<name>` removed. We'll forward the rest of the path
			// to the Durable Object.
			let newUrl = new URL(request.url)
			newUrl.pathname = '/' + path.slice(2).join('/')

			// Send the request to the object. The `fetch()` method of a Durable Object stub has the
			// same signature as the global `fetch()` function, but the request is always sent to the
			// object, regardless of the request's URL.
			return roomObject.fetch(newUrl.toString(), request)
		}
		default:
			return new Response('Not found', { status: 404 })
	}
}
