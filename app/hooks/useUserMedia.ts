import { getCamera, getMic } from 'partytracks/client'
import { useObservableAsValue } from 'partytracks/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocalStorage } from 'react-use'
import { map, of, tap } from 'rxjs'
import invariant from 'tiny-invariant'
import blurVideoTrack from '~/utils/blurVideoTrack'
import { mode } from '~/utils/mode'
import noiseSuppression from '~/utils/noiseSuppression'
import { getScreenshare$ } from '~/utils/rxjs/getScreenshare$'

export const errorMessageMap = {
	NotAllowedError:
		'Permission was denied. Grant permission and reload to enable.',
	NotFoundError: 'No device was found.',
	NotReadableError: 'Device is already in use.',
	OverconstrainedError: 'No device was found that meets constraints.',
	DevicesExhaustedError: 'All devices failed to initialize.',
	UnknownError: 'An unknown error occurred.',
}

type UserMediaError = keyof typeof errorMessageMap

const broadcastByDefault = mode === 'production'
const mic = getMic({ broadcasting: broadcastByDefault })
const camera = getCamera({ broadcasting: true })

function useNoiseSuppression() {
	const [suppressNoise, setSuppressNoise] = useLocalStorage(
		'suppress-noise',
		false
	)
	useEffect(() => {
		if (suppressNoise) mic.addTransform(noiseSuppression)
		return () => {
			mic.removeTransform(noiseSuppression)
		}
	}, [suppressNoise])

	return [suppressNoise, setSuppressNoise] as const
}

function useBlurVideo() {
	const [blurVideo, setBlurVideo] = useLocalStorage('blur-video', false)
	useEffect(() => {
		if (blurVideo) camera.addTransform(blurVideoTrack)
		return () => {
			camera.removeTransform(blurVideoTrack)
		}
	}, [blurVideo])

	return [blurVideo, setBlurVideo] as const
}

function useScreenshare() {
	const [screenShareEnabled, setScreenShareEnabled] = useState(false)
	const startScreenShare = useCallback(() => setScreenShareEnabled(true), [])
	const endScreenShare = useCallback(() => setScreenShareEnabled(false), [])
	const screenShareVideoTrack$ = useMemo(
		() =>
			screenShareEnabled
				? getScreenshare$({ contentHint: 'text' }).pipe(
						tap({
							next: (ms) => {
								if (ms === undefined) {
									setScreenShareEnabled(false)
								}
							},
							finalize: () => setScreenShareEnabled(false),
						}),
						map((ms) => ms?.getVideoTracks()[0])
					)
				: of(undefined),
		[screenShareEnabled]
	)
	const screenShareVideoTrack = useObservableAsValue(screenShareVideoTrack$)

	return {
		screenShareEnabled,
		startScreenShare,
		endScreenShare,
		screenShareVideoTrack$,
		screenShareVideoTrack,
	}
}

export default function useUserMedia() {
	const [suppressNoise, setSuppressNoise] = useNoiseSuppression()
	const [blurVideo, setBlurVideo] = useBlurVideo()

	const [videoUnavailableReason, setVideoUnavailableReason] =
		useState<UserMediaError>()
	const [audioUnavailableReason, setAudioUnavailableReason] =
		useState<UserMediaError>()

	const {
		endScreenShare,
		startScreenShare,
		screenShareEnabled,
		screenShareVideoTrack,
		screenShareVideoTrack$,
	} = useScreenshare()

	const micDevices = useObservableAsValue(mic.devices$, [])
	const cameraDevices = useObservableAsValue(camera.devices$, [])

	const publicAudioTrack$ = useMemo(
		() =>
			mic.broadcastTrack$.pipe(
				tap({
					error: (e) => {
						invariant(e instanceof Error)
						const reason =
							e.name in errorMessageMap
								? (e.name as UserMediaError)
								: 'UnknownError'
						if (reason === 'UnknownError') {
							console.error('Unknown error getting audio track: ', e)
						}
						setAudioUnavailableReason(reason)
						mic.stopBroadcasting()
					},
				})
			),
		[mic]
	)

	const videoTrack$ = useMemo(
		() =>
			camera.broadcastTrack$.pipe(
				tap({
					error: (e) => {
						invariant(e instanceof Error)
						const reason =
							e.name in errorMessageMap
								? (e.name as UserMediaError)
								: 'UnknownError'
						if (reason === 'UnknownError') {
							console.error('Unknown error getting video track: ', e)
						}
						setVideoUnavailableReason(reason)
						camera.stopBroadcasting()
					},
				})
			),
		[camera]
	)

	return {
		turnMicOn: mic.startBroadcasting,
		turnMicOff: mic.stopBroadcasting,
		audioStreamTrack: useObservableAsValue(publicAudioTrack$),
		audioMonitorStreamTrack: useObservableAsValue(mic.localMonitorTrack$),
		audioEnabled: useObservableAsValue(mic.isBroadcasting$, broadcastByDefault),
		audioUnavailableReason,
		publicAudioTrack$,
		privateAudioTrack$: mic.localMonitorTrack$,
		audioDeviceId: useObservableAsValue(mic.activeDevice$)?.deviceId,
		setAudioDeviceId: (deviceId: string) => {
			const found = micDevices.find((d) => d.deviceId === deviceId)
			if (found) mic.setPreferredDevice(found)
		},

		setVideoDeviceId: (deviceId: string) => {
			const found = cameraDevices.find((d) => d.deviceId === deviceId)
			if (found) camera.setPreferredDevice(found)
		},
		videoDeviceId: useObservableAsValue(camera.activeDevice$)?.deviceId,
		turnCameraOn: camera.startBroadcasting,
		turnCameraOff: camera.stopBroadcasting,
		videoEnabled: useObservableAsValue(camera.isBroadcasting$, true),
		videoUnavailableReason,
		blurVideo,
		setBlurVideo,
		suppressNoise,
		setSuppressNoise,
		videoTrack$,
		videoStreamTrack: useObservableAsValue(videoTrack$),

		startScreenShare,
		endScreenShare,
		screenShareVideoTrack,
		screenShareEnabled,
		screenShareVideoTrack$,
	}
}

export type UserMedia = ReturnType<typeof useUserMedia>
