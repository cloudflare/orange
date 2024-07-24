import { redirect } from '@remix-run/cloudflare'
import { nanoid } from 'nanoid'

export const loader = async () => {
	// we use this path if someone clicks the link
	// to create a new room before the js has loaded
	const roomName = nanoid(8)
	return redirect('/' + roomName)
}
