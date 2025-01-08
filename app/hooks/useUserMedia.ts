import { useObservableAsValue, useValueAsObservable } from 'partytracks/react'
import { useCallback, useMemo, useState } from 'react'
import { useLocalStorage } from 'react-use'
import { combineLatest, map, of, shareReplay, switchMap, tap } from 'rxjs'
import invariant from 'tiny-invariant'
import { blackCanvasStreamTrack } from '~/utils/blackCanvasStreamTrack'
import blurVideoTrack from '~/utils/blurVideoTrack'
import noiseSuppression from '~/utils/noiseSuppression'
import { prependDeviceToPrioritizeList } from '~/utils/rxjs/devicePrioritization'
import { getScreenshare$ } from '~/utils/rxjs/getScreenshare$'
import { getUserMediaTrack$ } from '~/utils/rxjs/getUserMediaTrack$'
import { mutedAudioTrack$ } from '~/utils/rxjs/mutedAudioTrack$'

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

export default function useUserMedia() {
	const [blurVideo, setBlurVideo] = useLocalStorage('blur-video', false)
	const [suppressNoise, setSuppressNoise] = useLocalStorage(
		'suppress-noise',
		false
	)
	const [audioEnabled, setAudioEnabled] = useState(true)
	const [videoEnabled, setVideoEnabled] = useState(true)
	const [screenShareEnabled, setScreenShareEnabled] = useState(false)
	const [videoUnavailableReason, setVideoUnavailableReason] =
		useState<UserMediaError>()
	const [audioUnavailableReason, setAudioUnavailableReason] =
		useState<UserMediaError>()

	const turnMicOff = useCallback(() => setAudioEnabled(false), [])
	const turnMicOn = useCallback(() => setAudioEnabled(true), [])
	const turnCameraOn = useCallback(() => setVideoEnabled(true), [])
	const turnCameraOff = useCallback(() => setVideoEnabled(false), [])
	const startScreenShare = useCallback(() => setScreenShareEnabled(true), [])
	const endScreenShare = useCallback(() => setScreenShareEnabled(false), [])

	const blurVideo$ = useValueAsObservable(blurVideo)
	const videoEnabled$ = useValueAsObservable(videoEnabled)
	const videoTrack$ = useMemo(
		() =>
			combineLatest([
				videoEnabled$.pipe(
					switchMap((enabled) =>
						enabled
							? getUserMediaTrack$('videoinput').pipe(
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
											setVideoEnabled(false)
										},
									})
								)
							: of(blackCanvasStreamTrack())
					)
				),
				blurVideo$,
			]).pipe(
				switchMap(([track, blur]) =>
					blur && track ? blurVideoTrack(track) : of(track)
				),
				shareReplay({
					refCount: true,
					bufferSize: 1,
				})
			),
		[videoEnabled$, blurVideo$]
	)
	const videoTrack = useObservableAsValue(videoTrack$)
	const videoDeviceId = videoTrack?.getSettings().deviceId

	const suppressNoiseEnabled$ = useValueAsObservable(suppressNoise)
	const audioTrack$ = useMemo(() => {
		return combineLatest([
			getUserMediaTrack$('audioinput').pipe(
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
						setAudioEnabled(false)
					},
				})
			),
			suppressNoiseEnabled$,
		]).pipe(
			switchMap(([track, suppressNoise]) =>
				of(suppressNoise && track ? noiseSuppression(track) : track)
			),
			shareReplay({
				refCount: true,
				bufferSize: 1,
			})
		)
	}, [suppressNoiseEnabled$])

	const alwaysOnAudioStreamTrack = useObservableAsValue(audioTrack$)
	const audioDeviceId = alwaysOnAudioStreamTrack?.getSettings().deviceId
	const audioEnabled$ = useValueAsObservable(audioEnabled)
	const publicAudioTrack$ = useMemo(
		() =>
			audioEnabled$.pipe(
				switchMap((enabled) => (enabled ? audioTrack$ : mutedAudioTrack$)),
				shareReplay({
					refCount: true,
					bufferSize: 1,
				})
			),
		[audioEnabled$, audioTrack$]
	)
	const audioStreamTrack = useObservableAsValue(publicAudioTrack$)

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

	const setVideoDeviceId = (deviceId: string) =>
		navigator.mediaDevices.enumerateDevices().then((devices) => {
			const device = devices.find((d) => d.deviceId === deviceId)
			if (device) prependDeviceToPrioritizeList(device)
		})

	const setAudioDeviceId = (deviceId: string) =>
		navigator.mediaDevices.enumerateDevices().then((devices) => {
			const device = devices.find((d) => d.deviceId === deviceId)
			if (device) prependDeviceToPrioritizeList(device)
		})

	return {
		turnMicOn,
		turnMicOff,
		audioStreamTrack,
		audioMonitorStreamTrack: alwaysOnAudioStreamTrack,
		audioEnabled,
		audioUnavailableReason,
		publicAudioTrack$,
		privateAudioTrack$: audioTrack$,
		audioDeviceId,
		setAudioDeviceId,

		setVideoDeviceId,
		videoDeviceId,
		turnCameraOn,
		turnCameraOff,
		videoEnabled,
		videoUnavailableReason,
		blurVideo,
		setBlurVideo,
		suppressNoise,
		setSuppressNoise,
		videoTrack$,
		videoStreamTrack: videoTrack,

		startScreenShare,
		endScreenShare,
		screenShareVideoTrack,
		screenShareEnabled,
		screenShareVideoTrack$,
	}
}

export type UserMedia = ReturnType<typeof useUserMedia>
