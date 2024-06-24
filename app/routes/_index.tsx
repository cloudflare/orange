import type { ActionFunction, LoaderFunctionArgs } from '@remix-run/cloudflare'
import { useState, useEffect } from 'react';
import slugify from 'slugify';
import { json, redirect } from '@remix-run/cloudflare'
import { Form, useLoaderData } from '@remix-run/react'
import invariant from 'tiny-invariant'
import { Button, ButtonLink } from '~/components/Button'
import { Disclaimer } from '~/components/Disclaimer'
import { Input } from '~/components/Input'
import { Label } from '~/components/Label'
import { useUserMetadata } from '~/hooks/useUserMetadata'
import { ACCESS_AUTHENTICATED_USER_EMAIL_HEADER } from '~/utils/constants'
import getUsername from '~/utils/getUsername.server'

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
	const directoryUrl = context.USER_DIRECTORY_URL
	const username = await getUsername(request)
	invariant(username)
	const usedAccess = request.headers.has(ACCESS_AUTHENTICATED_USER_EMAIL_HEADER)
	return json({ username, usedAccess, directoryUrl })
}

export const action: ActionFunction = async ({ request }) => {
	const room = (await request.formData()).get('room')
	invariant(typeof room === 'string')
	return redirect(room.replace(/ /g, '-'))
}

export default function Index() {
	const { username, usedAccess } = useLoaderData<typeof loader>()
	const [roomName, setRoomName] = useState('');
	const [slugifyRoomName, setSlugifyRoomName] = useState('');

	useEffect(() => {
		if (roomName) {
			const slugifiedRoomName = slugify(roomName);
			setSlugifyRoomName(slugify(roomName));
		}
	}, [roomName]);


	const { data } = useUserMetadata(username)

	return (
		<div className="flex flex-col items-center justify-center h-full p-4 mx-auto">
			<div className="flex-1"></div>
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold">BeKind Meets</h1>
					<div className="flex items-center justify-between gap-3">
						<p className="text-sm text-zinc-500 dark:text-zinc-400 ">
							Logged in as <span className="font-bold"> {data?.displayName}</span>
						</p>
						{!usedAccess && (
							<a
								className="block text-sm underline text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
								href="/set-username"
							>
								Change
							</a>
						)}
					</div>
				</div>
				<div>
					<Label>Room name</Label>
					<input type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)} className="w-full rounded border-2 border-zinc-500 text-zinc-900 dark:text-zinc-50 bg-zinc-50 dark:bg-zinc-700 px-2 py-1" />
				</div>

				<div>
					<ButtonLink to={`/${slugifyRoomName}`} className="text-sm bg-teal-400 border-teal-400 hover:bg-teal-500 hover:border-teal-500">
						New Room
					</ButtonLink>
				</div>
				<details className="cursor-pointer">
					<summary className="text-zinc-500 dark:text-zinc-400">
						Or join a room
					</summary>
					<Form className="flex items-end w-full gap-4 pt-4" method="post">
						<div className="space-y-2">
							<Label htmlFor="room">Room name</Label>
							<Input name="room" id="room" required />
						</div>
						<Button className="text-xs" type="submit" displayType="secondary">
							Join
						</Button>
					</Form>
				</details>
			</div>
			<div className="flex flex-col justify-end flex-1">
				<Disclaimer className="pt-6" />
			</div>
		</div>
	)
}
