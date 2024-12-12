import type { LoaderFunctionArgs } from '@remix-run/cloudflare'
import { json } from '@remix-run/cloudflare'
import { Outlet, useLoaderData, useParams } from '@remix-run/react'
import { useMemo, useState } from 'react'
import { from, of, switchMap } from 'rxjs'
import invariant from 'tiny-invariant'
import { EnsureOnline } from '~/components/EnsureOnline'
import { EnsurePermissions } from '~/components/EnsurePermissions'
import { Icon } from '~/components/Icon/Icon'
import { Spinner } from '~/components/Spinner'
import { useStateObservable, useSubscribedState } from '~/hooks/rxjsHooks'

import { usePeerConnection } from '~/hooks/usePeerConnection'
import useRoom from '~/hooks/useRoom'
import type { RoomContextType } from '~/hooks/useRoomContext'
import { useRoomHistory } from '~/hooks/useRoomHistory'
import { useStablePojo } from '~/hooks/useStablePojo'
import useUserMedia from '~/hooks/useUserMedia'
import type { TrackObject } from '~/utils/callsTypes'
import { getIceServers } from '~/utils/getIceServers.server'

function numberOrUndefined(value: unknown): number | undefined {
	const num = Number(value)
	return isNaN(num) ? undefined : num
}

function trackObjectToString(trackObject?: TrackObject) {
	if (!trackObject) return undefined
	return trackObject.sessionId + '/' + trackObject.trackName
}

export const loader = async ({ context }: LoaderFunctionArgs) => {
	const {
		env: {
			TRACE_LINK,
			API_EXTRA_PARAMS,
			MAX_WEBCAM_FRAMERATE,
			MAX_WEBCAM_BITRATE,
			MAX_WEBCAM_QUALITY_LEVEL,
			MAX_API_HISTORY,
		},
	} = context

	return json({
		userDirectoryUrl: context.env.USER_DIRECTORY_URL,
		traceLink: TRACE_LINK,
		apiExtraParams: API_EXTRA_PARAMS,
		iceServers: await getIceServers(context.env),
		feedbackEnabled: Boolean(
			context.env.FEEDBACK_URL &&
				context.env.FEEDBACK_QUEUE &&
				context.env.FEEDBACK_STORAGE
		),
		maxWebcamFramerate: numberOrUndefined(MAX_WEBCAM_FRAMERATE),
		maxWebcamBitrate: numberOrUndefined(MAX_WEBCAM_BITRATE),
		maxWebcamQualityLevel: numberOrUndefined(MAX_WEBCAM_QUALITY_LEVEL),
		maxApiHistory: numberOrUndefined(MAX_API_HISTORY),
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
				<RoomPreparation />
			</EnsureOnline>
		</EnsurePermissions>
	)
}

function RoomPreparation() {
	const { roomName } = useParams()
	invariant(roomName)
	const userMedia = useUserMedia()
	const room = useRoom({ roomName, userMedia })

	return room.roomState.meetingId ? (
		<Room room={room} userMedia={userMedia} />
	) : (
		<div className="grid place-items-center h-full">
			<Spinner className="text-gray-500" />
		</div>
	)
}

function tryToGetDimensions(videoStreamTrack?: MediaStreamTrack) {
	if (
		videoStreamTrack === undefined ||
		// TODO: Determine a better way to get dimensions in Firefox
		// where this isn't API isn't supported. For now, Firefox will
		// just not be constrained and scaled down by dimension scaling
		// but the bandwidth and framerate constraints will still apply
		// https://caniuse.com/?search=getCapabilities
		videoStreamTrack.getCapabilities === undefined
	) {
		return { height: 0, width: 0 }
	}
	const height = videoStreamTrack?.getCapabilities().height?.max ?? 0
	const width = videoStreamTrack?.getCapabilities().width?.max ?? 0

	return { height, width }
}

interface RoomProps {
	room: ReturnType<typeof useRoom>
	userMedia: ReturnType<typeof useUserMedia>
}

function Room({ room, userMedia }: RoomProps) {
	const [joined, setJoined] = useState(false)
	const [dataSaverMode, setDataSaverMode] = useState(false)
	const { roomName } = useParams()
	invariant(roomName)

	const {
		userDirectoryUrl,
		traceLink,
		feedbackEnabled,
		apiExtraParams,
		iceServers,
		maxWebcamBitrate = 1_200_000,
		maxWebcamFramerate = 24,
		maxWebcamQualityLevel = 1080,
		maxApiHistory = 100,
	} = useLoaderData<typeof loader>()

	const params = new URLSearchParams(apiExtraParams)

	invariant(room.roomState.meetingId, 'Meeting ID cannot be missing')
	params.set('correlationId', room.roomState.meetingId)

	const { peer, iceConnectionState } = usePeerConnection({
		maxApiHistory,
		apiExtraParams: params.toString(),
		iceServers,
		apiBase: '/api/calls',
	})
	const roomHistory = useRoomHistory(peer, room)

	const scaleResolutionDownBy = useMemo(() => {
		const videoStreamTrack = userMedia.videoStreamTrack
		const { height, width } = tryToGetDimensions(videoStreamTrack)
		// we need to do this in case camera is in portrait mode
		const smallestDimension = Math.min(height, width)
		return Math.max(smallestDimension / maxWebcamQualityLevel, 1)
	}, [maxWebcamQualityLevel, userMedia.videoStreamTrack])

	const videoEncodingParams = useStablePojo<RTCRtpEncodingParameters[]>([
		{
			maxFramerate: maxWebcamFramerate,
			maxBitrate: maxWebcamBitrate,
			scaleResolutionDownBy,
		},
	])
	const videoTrackEncodingParams$ =
		useStateObservable<RTCRtpEncodingParameters[]>(videoEncodingParams)
	const pushedVideoTrack$ = useMemo(
		() => peer.pushTrack(userMedia.videoTrack$, videoTrackEncodingParams$),
		[peer, userMedia.videoTrack$, videoTrackEncodingParams$]
	)

	const pushedVideoTrack = useSubscribedState(pushedVideoTrack$)

	const pushedAudioTrack$ = useMemo(
		() =>
			peer.pushTrack(
				userMedia.publicAudioTrack$,
				of<RTCRtpEncodingParameters[]>([
					{
						networkPriority: 'high',
					},
				])
			),
		[peer, userMedia.publicAudioTrack$]
	)
	const pushedAudioTrack = useSubscribedState(pushedAudioTrack$)

	const pushedScreenSharingTrack$ = useMemo(() => {
		return userMedia.screenShareVideoTrack$.pipe(
			switchMap((track) =>
				track ? from(peer.pushTrack(of(track))) : of(undefined)
			)
		)
	}, [peer, userMedia.screenShareVideoTrack$])
	const pushedScreenSharingTrack = useSubscribedState(pushedScreenSharingTrack$)

	const context: RoomContextType = {
		joined,
		setJoined,
		dataSaverMode,
		setDataSaverMode,
		traceLink,
		userMedia,
		userDirectoryUrl,
		feedbackEnabled,
		peer,
		roomHistory,
		iceConnectionState,
		room,
		pushedTracks: {
			video: trackObjectToString(pushedVideoTrack),
			audio: trackObjectToString(pushedAudioTrack),
			screenshare: trackObjectToString(pushedScreenSharingTrack),
		},
	}

	return <Outlet context={context} />
}
