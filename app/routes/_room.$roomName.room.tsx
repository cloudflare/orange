import type { LoaderFunctionArgs } from '@remix-run/cloudflare'
import { json } from '@remix-run/cloudflare'
import {
	useLoaderData,
	useNavigate,
	useParams,
	useSearchParams,
} from '@remix-run/react'
import { useEffect, useState } from 'react'
import { useMount, useWindowSize } from 'react-use'
import { AiButton } from '~/components/AiButton'
import { CameraButton } from '~/components/CameraButton'
import { CopyButton } from '~/components/CopyButton'
import { HighPacketLossWarningsToast } from '~/components/HighPacketLossWarningsToast'
import { IceDisconnectedToast } from '~/components/IceDisconnectedToast'
import { LeaveRoomButton } from '~/components/LeaveRoomButton'
import { MicButton } from '~/components/MicButton'
import { OverflowMenu } from '~/components/OverflowMenu'
import { ParticipantLayout } from '~/components/ParticipantLayout'
import { ParticipantsButton } from '~/components/ParticipantsMenu'
import { PullAudioTracks } from '~/components/PullAudioTracks'
import { RaiseHandButton } from '~/components/RaiseHandButton'
import { ScreenshareButton } from '~/components/ScreenshareButton'
import Toast from '~/components/Toast'
import useBroadcastStatus from '~/hooks/useBroadcastStatus'
import useIsSpeaking from '~/hooks/useIsSpeaking'
import { useRoomContext } from '~/hooks/useRoomContext'
import { useShowDebugInfoShortcut } from '~/hooks/useShowDebugInfoShortcut'
import useSounds from '~/hooks/useSounds'
import useStageManager from '~/hooks/useStageManager'
import { useUserJoinLeaveToasts } from '~/hooks/useUserJoinLeaveToasts'
import getUsername from '~/utils/getUsername.server'
import isNonNullable from '~/utils/isNonNullable'

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
	const username = await getUsername(request)

	return json({
		username,
		bugReportsEnabled: Boolean(
			context.env.FEEDBACK_URL &&
				context.env.FEEDBACK_QUEUE &&
				context.env.FEEDBACK_STORAGE
		),
		mode: context.mode,
		hasDb: Boolean(context.env.DB),
		hasAiCredentials: Boolean(
			context.env.OPENAI_API_TOKEN && context.env.OPENAI_MODEL_ENDPOINT
		),
	})
}

export default function Room() {
	const { joined } = useRoomContext()
	const navigate = useNavigate()
	const { roomName } = useParams()
	const { mode, bugReportsEnabled } = useLoaderData<typeof loader>()
	const [search] = useSearchParams()

	useEffect(() => {
		if (!joined && mode !== 'development')
			navigate(`/${roomName}${search.size > 0 ? '?' + search.toString() : ''}`)
	}, [joined, mode, navigate, roomName, search])

	if (!joined && mode !== 'development') return null

	return (
		<Toast.Provider>
			<JoinedRoom bugReportsEnabled={bugReportsEnabled} />
		</Toast.Provider>
	)
}

function JoinedRoom({ bugReportsEnabled }: { bugReportsEnabled: boolean }) {
	const { hasDb, hasAiCredentials } = useLoaderData<typeof loader>()
	const {
		userMedia,
		partyTracks,
		pushedTracks,
		showDebugInfo,
		pinnedTileIds,
		room: {
			otherUsers,
			websocket,
			identity,
			roomState: { meetingId },
		},
	} = useRoomContext()

	useShowDebugInfoShortcut()

	const [raisedHand, setRaisedHand] = useState(false)
	const speaking = useIsSpeaking(userMedia.audioStreamTrack)

	useMount(() => {
		if (otherUsers.length > 5) {
			userMedia.turnMicOff()
		}
	})

	useBroadcastStatus({
		userMedia,
		partyTracks: partyTracks,
		websocket,
		identity,
		pushedTracks,
		raisedHand,
		speaking,
	})

	useSounds(otherUsers)
	useUserJoinLeaveToasts(otherUsers)

	const { width } = useWindowSize()

	const someScreenshare =
		otherUsers.some((u) => u.tracks.screenshare) ||
		Boolean(identity?.tracks.screenshare)
	const stageLimit = width < 600 ? 2 : someScreenshare ? 5 : 8

	const { recordActivity, actorsOnStage } = useStageManager(
		otherUsers,
		stageLimit,
		identity
	)

	useEffect(() => {
		otherUsers.forEach((u) => {
			if (u.speaking || u.raisedHand) recordActivity(u)
		})
	}, [otherUsers, recordActivity])

	const pinnedActors = actorsOnStage.filter((u) => pinnedTileIds.includes(u.id))
	const unpinnedActors = actorsOnStage.filter(
		(u) => !pinnedTileIds.includes(u.id)
	)

	return (
		<PullAudioTracks
			audioTracks={otherUsers.map((u) => u.tracks.audio).filter(isNonNullable)}
		>
			<div className="flex flex-col h-full bg-white dark:bg-zinc-800">
				<div className="relative flex-grow bg-black isolate">
					<div
						className="absolute inset-0 flex isolate gap-[var(--gap)] p-[var(--gap)]"
						style={
							{
								'--gap': '1rem',
							} as any
						}
					>
						{pinnedActors.length > 0 && (
							<div className="flex-grow-[5] overflow-hidden relative">
								<ParticipantLayout users={pinnedActors.filter(isNonNullable)} />
							</div>
						)}
						<div className="flex-grow overflow-hidden relative">
							<ParticipantLayout users={unpinnedActors.filter(isNonNullable)} />
						</div>
					</div>
					<Toast.Viewport className="absolute bottom-0 right-0" />
				</div>
				<div className="flex flex-wrap items-center justify-center gap-2 p-2 text-sm md:gap-4 md:p-5 md:text-base">
					{hasAiCredentials && <AiButton recordActivity={recordActivity} />}
					<MicButton warnWhenSpeakingWhileMuted />
					<CameraButton />
					<ScreenshareButton />
					<RaiseHandButton
						raisedHand={raisedHand}
						onClick={() => setRaisedHand(!raisedHand)}
					/>
					<ParticipantsButton
						identity={identity}
						otherUsers={otherUsers}
						className="hidden md:block"
					></ParticipantsButton>
					<OverflowMenu bugReportsEnabled={bugReportsEnabled} />
					<LeaveRoomButton
						navigateToFeedbackPage={hasDb}
						meetingId={meetingId}
					/>
					{showDebugInfo && meetingId && (
						<CopyButton contentValue={meetingId}>Meeting Id</CopyButton>
					)}
				</div>
			</div>
			<HighPacketLossWarningsToast />
			<IceDisconnectedToast />
		</PullAudioTracks>
	)
}
