import { redirect, type LoaderFunctionArgs } from '@remix-run/cloudflare'
import { nanoid } from 'nanoid'

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const params = new URL(request.url).searchParams
	// we use this path if someone clicks the link
	// to create a new room before the js has loaded
	const roomName = nanoid(8)
	return redirect(
		'/' + roomName + (params.size > 0 ? '?' + params.toString() : '')
	)
}
