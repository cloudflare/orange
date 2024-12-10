import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { useRoomContext } from '~/hooks/useRoomContext'
import { Button } from './Button'
import { Icon } from './Icon/Icon'
import { Tooltip } from './Tooltip'

interface ScreenshareButtonProps {}

export const ScreenshareButton: FC<ScreenshareButtonProps> = () => {
	const {
		userMedia: { screenShareVideoTrack, startScreenShare, endScreenShare },
		room: { otherUsers },
	} = useRoomContext()

	const otherUserIsSharing = otherUsers.some((u) => u.tracks.screenshare)

	const sharing = screenShareVideoTrack !== undefined

	const [canShareScreen, setCanShareScreen] = useState(true)

	// setting this in a useEffect because we need to do this feature
	// detection to remove it for iOS, but the feature detection also
	// doesn't work on the server, so it causes a mismatch between
	// the server/client that React doesn't like
	useEffect(() => {
		setCanShareScreen(
			typeof navigator.mediaDevices !== 'undefined' &&
				navigator.mediaDevices.getDisplayMedia !== undefined
		)
	}, [])

	if (!canShareScreen) return null

	return (
		<Tooltip
			content={
				otherUserIsSharing
					? 'Someone else is sharing'
					: sharing
						? 'Stop sharing'
						: 'Share screen'
			}
		>
			<Button
				displayType={sharing ? 'danger' : 'secondary'}
				disabled={otherUserIsSharing}
				onClick={sharing ? endScreenShare : startScreenShare}
			>
				<VisuallyHidden>Share screen</VisuallyHidden>
				<Icon type="screenshare" />
			</Button>
		</Tooltip>
	)
}
