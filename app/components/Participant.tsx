import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { forwardRef, useEffect } from 'react'
import { Flipped } from 'react-flip-toolkit'
import { useDeadPulledTrackMonitor } from '~/hooks/useDeadPulledTrackMonitor'
import { useRoomContext } from '~/hooks/useRoomContext'
import { useUserMetadata } from '~/hooks/useUserMetadata'
import type { User } from '~/types/Messages'
import populateTraceLink from '~/utils/populateTraceLink'
import { cn } from '~/utils/style'
import { AudioGlow } from './AudioGlow'
import { AudioIndicator } from './AudioIndicator'
import { Button } from './Button'
import { HoverFade } from './HoverFade'
import { Icon } from './Icon/Icon'
import { MuteUserButton } from './MuteUserButton'
import { OptionalLink } from './OptionalLink'
import { Tooltip } from './Tooltip'
import { VideoSrcObject } from './VideoSrcObject'

export const Participant = forwardRef<
	HTMLDivElement,
	JSX.IntrinsicElements['div'] & {
		flipId: string
		isScreenShare?: boolean
		user: User
		audioTrack?: MediaStreamTrack
		videoTrack?: MediaStreamTrack
		isSelf?: boolean
		pinnedId?: string
		setPinnedId: (id?: string) => void
	}
>(
	(
		{
			videoTrack,
			isSelf = false,
			flipId,
			user,
			isScreenShare = false,
			audioTrack,
			pinnedId,
			setPinnedId,
		},
		ref
	) => {
		const { data } = useUserMetadata(user.name)
		const { traceLink } = useRoomContext()

		useDeadPulledTrackMonitor(
			user.tracks.video,
			user.transceiverSessionId,
			user.tracks.videoEnabled,
			videoTrack,
			user.name
		)

		useDeadPulledTrackMonitor(
			user.tracks.audio,
			user.transceiverSessionId,
			user.tracks.audioEnabled,
			audioTrack,
			user.name
		)

		const pinned = flipId === pinnedId

		useEffect(() => {
			if (isScreenShare) {
				setPinnedId(flipId)
			}
		}, [flipId, isScreenShare, setPinnedId])

		return (
			<div
				className="grow shrink text-base basis-[calc(var(--flex-container-width)_-_var(--gap)_*_3)]"
				ref={ref}
			>
				<Flipped flipId={flipId + pinned}>
					<div
						className={cn(
							'h-full mx-auto overflow-hidden text-white opacity-0 animate-fadeIn',
							pinned
								? 'absolute inset-0 h-full w-full z-10 rounded-none bg-black'
								: 'relative max-w-[--participant-max-width] rounded-xl'
						)}
					>
						{!isScreenShare && (
							<div
								className={cn(
									'absolute inset-0 h-full w-full grid place-items-center'
								)}
							>
								<div className="h-[2em] w-[2em] grid place-items-center text-4xl md:text-6xl 2xl:text-8xl relative">
									{data?.photob64 ? (
										<div>
											<AudioGlow
												className="absolute inset-0 w-full h-full rounded-full"
												audioTrack={audioTrack}
												type="box"
											></AudioGlow>
											<img
												className="rounded-full"
												src={`data:image/png;base64,${data.photob64}`}
												alt={data.displayName}
											/>
										</div>
									) : (
										<span className="relative grid w-full h-full uppercase rounded-full place-items-center bg-zinc-500">
											{user.speaking && (
												<AudioGlow
													type="text"
													className="absolute uppercase"
													audioTrack={audioTrack}
												>
													{user.name.charAt(0)}
												</AudioGlow>
											)}
											{user.name.charAt(0)}
										</span>
									)}
								</div>
							</div>
						)}
						<VideoSrcObject
							className={cn(
								'absolute inset-0 h-full w-full object-contain opacity-0 transition-opacity',
								isSelf && !isScreenShare && '-scale-x-100',
								{
									'opacity-100': isScreenShare
										? user.tracks.screenShareEnabled
										: user.tracks.videoEnabled,
								},
								isSelf && isScreenShare && 'opacity-75'
							)}
							videoTrack={videoTrack}
						/>
						<HoverFade className="absolute inset-0 grid w-full h-full place-items-center">
							<div className="flex gap-2 p-2 rounded bg-zinc-900/30">
								<Tooltip content={pinned ? 'Restore' : 'Maximize'}>
									<Button
										onClick={() => setPinnedId(pinned ? undefined : flipId)}
										displayType="ghost"
									>
										<Icon type={pinned ? 'arrowsIn' : 'arrowsOut'} />
									</Button>
								</Tooltip>
								{!isScreenShare && (
									<MuteUserButton
										displayType="ghost"
										mutedDisplayType="ghost"
										user={user}
									/>
								)}
							</div>
						</HoverFade>
						{audioTrack && (
							<div className="absolute left-4 top-4">
								{user.tracks.audioEnabled &&
									user.tracks.videoEnabled &&
									user.speaking && <AudioIndicator audioTrack={audioTrack} />}

								{!user.tracks.audioEnabled && (
									<Tooltip content="Mic is turned off">
										<div className="indication-shadow">
											<Icon type="micOff" />
											<VisuallyHidden>Mic is turned off</VisuallyHidden>
										</div>
									</Tooltip>
								)}
							</div>
						)}
						{data?.displayName && user.transceiverSessionId && (
							<OptionalLink
								className="absolute m-2 leading-none text-shadow left-1 bottom-1"
								href={populateTraceLink(user.transceiverSessionId, traceLink)}
								target="_blank"
								rel="noopener noreferrer"
							>
								{data.displayName}
							</OptionalLink>
						)}
						<div className="absolute top-0 right-0 flex gap-4 p-4">
							{user.raisedHand && (
								<Tooltip content="Hand is raised">
									<div className="relative">
										<div className="relative">
											<Icon className="indication-shadow" type="handRaised" />
											<Icon
												className="absolute top-0 left-0 text-orange-300 animate-ping"
												type="handRaised"
											/>
											<VisuallyHidden>Hand is raised</VisuallyHidden>
										</div>
									</div>
								</Tooltip>
							)}
						</div>
						{user.speaking && (
							<div
								className={cn(
									'pointer-events-none absolute inset-0 h-full w-full border-4 border-orange-400',
									!pinned && 'rounded-xl'
								)}
							></div>
						)}
					</div>
				</Flipped>
			</div>
		)
	}
)

Participant.displayName = 'CallGridChild'
