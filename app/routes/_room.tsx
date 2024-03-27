import type { LoaderFunctionArgs } from '@remix-run/cloudflare'
import { json } from '@remix-run/cloudflare'
import { Outlet, useLoaderData, useParams } from '@remix-run/react'
import { useState } from 'react'
import invariant from 'tiny-invariant'
import { EnsureOnline } from '~/components/EnsureOnline'
import { EnsurePermissions } from '~/components/EnsurePermissions'
import { Icon } from '~/components/Icon/Icon'

import { usePeerConnection } from '~/hooks/usePeerConnection'
import usePushedTrack from '~/hooks/usePushedTrack'
import useRoom from '~/hooks/useRoom'
import type { RoomContextType } from '~/hooks/useRoomContext'
import useUserMedia from '~/hooks/useUserMedia'

export const loader = async ({ context }: LoaderFunctionArgs) => {
	const { mode, TRACE_LINK } = context
	return json({
		mode,
		userDirectoryUrl: context.USER_DIRECTORY_URL,
		traceLink: TRACE_LINK,
	})
}

export default function RoomWithPermissions() {
	return (
		<EnsurePermissions>
			<EnsureOnline
				fallback={
					<div className="grid h-full place-items-center">
						<div>
							<h1 className="flex items-center gap-3 text-3xl font-black">
								<Icon type="SignalSlashIcon" />
								You are offline
							</h1>
						</div>
					</div>
				}
			>
				<Room />
			</EnsureOnline>
		</EnsurePermissions>
	)
}

function Room() {
	const [joined, setJoined] = useState(false)
	const { roomName } = useParams()
	invariant(roomName)

	const { mode, userDirectoryUrl, traceLink } = useLoaderData<typeof loader>()

	const userMedia = useUserMedia(mode)
	const room = useRoom({ roomName, userMedia })
	const { peer, debugInfo, iceConnectionState } = usePeerConnection()

	const pushedVideoTrack = usePushedTrack(peer, userMedia.videoStreamTrack)
	const pushedAudioTrack = usePushedTrack(peer, userMedia.audioStreamTrack)
	const pushedScreenSharingTrack = usePushedTrack(
		peer,
		userMedia.screenShareVideoTrack
	)

	const context: RoomContextType = {
		joined,
		setJoined,
		traceLink,
		userMedia,
		userDirectoryUrl,
		peer,
		peerDebugInfo: debugInfo,
		iceConnectionState,
		room,
		pushedTracks: {
			video: pushedVideoTrack,
			audio: pushedAudioTrack,
			screenshare: pushedScreenSharingTrack,
		},
	}

	return <Outlet context={context} />
}
