import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import type { LoaderFunctionArgs } from '@remix-run/cloudflare'
import { json } from '@remix-run/cloudflare'
import { useNavigate, useParams } from '@remix-run/react'
import invariant from 'tiny-invariant'
import { AudioIndicator } from '~/components/AudioIndicator'
import { Button } from '~/components/Button'
import { CameraButton } from '~/components/CameraButton'
import { CopyButton } from '~/components/CopyButton'
import { Disclaimer } from '~/components/Disclaimer'
import { Icon } from '~/components/Icon/Icon'
import { MicButton } from '~/components/MicButton'

import { SelfView } from '~/components/SelfView'
import { SettingsButton } from '~/components/SettingsDialog'
import { Tooltip } from '~/components/Tooltip'
import { useRoomContext } from '~/hooks/useRoomContext'
import { errorMessageMap } from '~/hooks/useUserMedia'
import getUsername from '~/utils/getUsername.server'

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const username = await getUsername(request)
	invariant(username)
	return json({ username })
}

export default function Lobby() {
	const { roomName } = useParams()
	const navigate = useNavigate()
	const { setJoined, userMedia, room } = useRoomContext()
	const { videoStreamTrack, audioStreamTrack, audioEnabled } = userMedia

	const joinedUsers = new Set(
		room.otherUsers.filter((u) => u.tracks.audio).map((u) => u.name)
	).size

	const audioUnavailableMessage = userMedia.audioUnavailableReason
		? errorMessageMap[userMedia.audioUnavailableReason]
		: null

	return (
		<div className="flex flex-col items-center justify-center h-full p-4">
			<div className="flex-1"></div>
			<div className="space-y-4 w-96">
				<div>
					<h1 className="text-3xl font-bold">{roomName}</h1>
					<p className="text-sm text-zinc-500 dark:text-zinc-400">
						{`${joinedUsers} ${
							joinedUsers === 1 ? 'user' : 'users'
						} in the room.`}{' '}
					</p>
				</div>
				<div className="relative">
					<SelfView
						className="aspect-[4/3] w-full"
						videoTrack={videoStreamTrack}
					/>
					{audioStreamTrack && (
						<div className="absolute left-3 top-3">
							{audioEnabled ? (
								<AudioIndicator audioTrack={audioStreamTrack} />
							) : (
								<Tooltip content="Mic is turned off">
									<div className="text-white indication-shadow">
										<Icon type="micOff" />
										<VisuallyHidden>Mic is turned off</VisuallyHidden>
									</div>
								</Tooltip>
							)}
						</div>
					)}
				</div>
				{(userMedia.audioUnavailableReason ||
					userMedia.videoUnavailableReason) && (
					<div className="p-3 rounded-md text-sm text-zinc-800 bg-zinc-200 dark:text-zinc-200 dark:bg-zinc-700">
						{userMedia.audioUnavailableReason === 'NotAllowedError' &&
							userMedia.videoUnavailableReason === undefined && (
								<p>Mic permission was denied.</p>
							)}
						{userMedia.videoUnavailableReason === 'NotAllowedError' &&
							userMedia.audioUnavailableReason === undefined && (
								<p>Camera permission was denied.</p>
							)}
						{userMedia.audioUnavailableReason === 'NotAllowedError' &&
							userMedia.videoUnavailableReason === 'NotAllowedError' && (
								<p>Mic and camera permissions were denied.</p>
							)}
						{userMedia.audioUnavailableReason === 'NotAllowedError' && (
							<p>
								Enable permission
								{userMedia.audioUnavailableReason &&
								userMedia.videoUnavailableReason
									? 's'
									: ''}{' '}
								and reload the page to join.
							</p>
						)}
						{userMedia.audioUnavailableReason === 'DevicesExhaustedError' && (
							<p>No working microphone found.</p>
						)}
						{userMedia.videoUnavailableReason === 'DevicesExhaustedError' && (
							<p>No working webcam found.</p>
						)}
						{userMedia.audioUnavailableReason === 'UnknownError' && (
							<p>Unknown microphone error.</p>
						)}
						{userMedia.videoUnavailableReason === 'UnknownError' && (
							<p>Unknown webcam error.</p>
						)}
					</div>
				)}
				<div className="flex gap-4 text-sm">
					{audioUnavailableMessage ? (
						<Tooltip content="Unable to join without a mic.">
							<Button disabled>Join</Button>
						</Tooltip>
					) : (
						<Button
							onClick={() => {
								setJoined(true)
								// we navigate here with javascript instead of an a
								// tag because we don't want it to be possible to join
								// the room without the JS having loaded
								navigate('room')
							}}
						>
							Join
						</Button>
					)}
					<MicButton />
					<CameraButton />
					<SettingsButton />
					<CopyButton></CopyButton>
				</div>
			</div>
			<div className="flex flex-col justify-end flex-1">
				<Disclaimer className="pt-6" />
			</div>
		</div>
	)
}
