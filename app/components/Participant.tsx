import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { forwardRef, useEffect, useMemo } from 'react'
import { Flipped } from 'react-flip-toolkit'
import { combineLatest, fromEvent, map, of, switchMap } from 'rxjs'
import { useSubscribedState } from '~/hooks/rxjsHooks'
import { useDeadPulledTrackMonitor } from '~/hooks/useDeadPulledTrackMonitor'
import useIsSpeaking from '~/hooks/useIsSpeaking'
import { useRoomContext } from '~/hooks/useRoomContext'
import { useUserMetadata } from '~/hooks/useUserMetadata'
import type { User } from '~/types/Messages'
import isNonNullable from '~/utils/isNonNullable'
import populateTraceLink from '~/utils/populateTraceLink'
import { ewma } from '~/utils/rxjs/ewma'
import { getPacketLoss$ } from '~/utils/rxjs/getPacketLoss$'
import { cn } from '~/utils/style'
import { AudioGlow } from './AudioGlow'
import { AudioIndicator } from './AudioIndicator'
import { Button } from './Button'
import {
	ConnectionIndicator,
	getConnectionQuality,
} from './ConnectionIndicator'
import { HoverFade } from './HoverFade'
import { Icon } from './Icon/Icon'
import { MuteUserButton } from './MuteUserButton'
import { OptionalLink } from './OptionalLink'
import { usePulledAudioTrack } from './PullAudioTracks'
import { Tooltip } from './Tooltip'
import { VideoSrcObject } from './VideoSrcObject'

function useMid(track?: MediaStreamTrack) {
	const { peer } = useRoomContext()
	const transceivers$ = useMemo(
		() =>
			combineLatest([
				peer.peerConnection$,
				peer.peerConnection$.pipe(
					switchMap((peerConnection) => fromEvent(peerConnection, 'track'))
				),
			]).pipe(map(([pc]) => pc.getTransceivers())),
		[peer.peerConnection$]
	)
	const transceivers = useSubscribedState(transceivers$, [])
	if (!track) return null
	return transceivers.find(
		(t) => t.sender.track === track || t.receiver.track === track
	)?.mid
}

interface Props {
	flipId: string
	isScreenShare?: boolean
	showDebugInfo?: boolean
	user: User
	audioTrack?: MediaStreamTrack
	videoTrack?: MediaStreamTrack
	isSelf?: boolean
	pinnedId?: string
	setPinnedId: (id?: string) => void
}

export const Participant = forwardRef<
	HTMLDivElement,
	JSX.IntrinsicElements['div'] & Props
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
			showDebugInfo,
		},
		ref
	) => {
		const { data } = useUserMetadata(user.name)
		const { traceLink, peer, dataSaverMode } = useRoomContext()
		const peerConnection = useSubscribedState(peer.peerConnection$)
		const isAi = user.id === 'ai'
		const aiAudioTrack = usePulledAudioTrack(
			isAi ? user.tracks.audio : undefined
		)
		const isSpeaking =
			useIsSpeaking(user.id === 'ai' ? aiAudioTrack : undefined) ||
			user.speaking

		useDeadPulledTrackMonitor(
			user.tracks.video,
			user.transceiverSessionId,
			!!user.tracks.video,
			videoTrack,
			user.name
		)

		useDeadPulledTrackMonitor(
			user.tracks.audio,
			user.transceiverSessionId,
			!!user.tracks.audio,
			audioTrack,
			user.name
		)

		const pinned = flipId === pinnedId

		useEffect(() => {
			if (isScreenShare) {
				setPinnedId(flipId)
			}
		}, [flipId, isScreenShare, setPinnedId])

		const packetLoss$ = useMemo(
			() =>
				getPacketLoss$(
					peer.peerConnection$,
					of([audioTrack, videoTrack].filter(isNonNullable))
				).pipe(ewma(5000)),
			[audioTrack, peer.peerConnection$, videoTrack]
		)

		const packetLoss = useSubscribedState(packetLoss$, 0)

		const audioMid = useMid(audioTrack)
		const videoMid = useMid(videoTrack)

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
											{isSpeaking && (
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
										: user.tracks.videoEnabled && (!dataSaverMode || isSelf),
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
									isSpeaking && <AudioIndicator audioTrack={audioTrack} />}

								{!user.tracks.audioEnabled && !user.tracks.audioUnavailable && (
									<Tooltip content="Mic is turned off">
										<div className="indication-shadow">
											<Icon type="micOff" />
											<VisuallyHidden>Mic is muted</VisuallyHidden>
										</div>
									</Tooltip>
								)}
								{user.tracks.audioUnavailable && (
									<Tooltip content="Mic is unavailable. User cannot unmute.">
										<div className="indication-shadow">
											<Icon type="micOff" className="text-red-400" />
											<VisuallyHidden>Mic is muted</VisuallyHidden>
										</div>
									</Tooltip>
								)}
							</div>
						)}
						{data?.displayName && user.transceiverSessionId && (
							<div className="flex items-center gap-2 absolute m-2 text-shadow left-1 bottom-1">
								<ConnectionIndicator
									quality={getConnectionQuality(packetLoss)}
								/>
								<OptionalLink
									className="leading-none"
									href={populateTraceLink(user.transceiverSessionId, traceLink)}
									target="_blank"
									rel="noopener noreferrer"
								>
									{data.displayName}
									{showDebugInfo && peerConnection && (
										<span className="opacity-50">
											{' '}
											{[
												audioMid && `audio mid: ${audioMid}`,
												videoMid && `video mid: ${videoMid}`,
											]
												.filter(Boolean)
												.join(' ')}
										</span>
									)}
								</OptionalLink>
							</div>
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
						{(isSpeaking || user.raisedHand) && (
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
