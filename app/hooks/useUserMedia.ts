import { useMemo, useState } from 'react'
import { useLocalStorage } from 'react-use'
import { combineLatest, map, of, shareReplay, switchMap, tap } from 'rxjs'
import invariant from 'tiny-invariant'
import { blackCanvasStreamTrack } from '~/utils/blackCanvasStreamTrack'
import blurVideoTrack from '~/utils/blurVideoTrack'
import type { Mode } from '~/utils/mode'
import noiseSuppression from '~/utils/noiseSuppression'
import { prependDeviceToPrioritizeList } from '~/utils/rxjs/devicePrioritization'
import { getScreenshare$ } from '~/utils/rxjs/getScreenshare$'
import { getUserMediaTrack$ } from '~/utils/rxjs/getUserMediaTrack$'
import { useStateObservable, useSubscribedState } from './rxjsHooks'

// export const userRejectedPermission = 'NotAllowedError'

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

export default function useUserMedia(mode: Mode) {
	const [blurVideo, setBlurVideo] = useLocalStorage('blur-video', false)
	const [suppressNoise, setSuppressNoise] = useLocalStorage(
		'suppress-noise',
		false
	)
	const [audioEnabled, setAudioEnabled] = useState(mode === 'production')
	const [videoEnabled, setVideoEnabled] = useState(true)
	const [screenShareEnabled, setScreenShareEnabled] = useState(false)
	const [videoUnavailableReason, setVideoUnavailableReason] =
		useState<UserMediaError>()
	const [audioUnavailableReason, setAudioUnavailableReason] =
		useState<UserMediaError>()

	const turnMicOff = () => setAudioEnabled(false)
	const turnMicOn = () => setAudioEnabled(true)
	const turnCameraOn = () => setVideoEnabled(true)
	const turnCameraOff = () => setVideoEnabled(false)
	const startScreenShare = () => setScreenShareEnabled(true)
	const endScreenShare = () => setScreenShareEnabled(false)

	const blurVideo$ = useStateObservable(blurVideo)
	const videoEnabled$ = useStateObservable(videoEnabled)
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
											setVideoUnavailableReason(
												e.name in errorMessageMap
													? (e.name as UserMediaError)
													: 'UnknownError'
											)
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
	const videoTrack = useSubscribedState(videoTrack$)
	const videoDeviceId = videoTrack?.getSettings().deviceId

	const suppressNoiseEnabled$ = useStateObservable(suppressNoise)
	const audioTrack$ = useMemo(() => {
		return combineLatest([
			getUserMediaTrack$('audioinput').pipe(
				tap({
					error: (e) => {
						invariant(e instanceof Error)
						setAudioUnavailableReason(
							e.name in errorMessageMap
								? (e.name as UserMediaError)
								: 'UnknownError'
						)
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
	const mutedAudioTrack$ = useMemo(() => {
		return combineLatest([
			getUserMediaTrack$('audioinput').pipe(
				tap({
					next: (track) => {
						track.enabled = false
					},
					error: (e) => {
						invariant(e instanceof Error)
						setAudioUnavailableReason(
							e.name in errorMessageMap
								? (e.name as UserMediaError)
								: 'UnknownError'
						)
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
	const alwaysOnAudioStreamTrack = useSubscribedState(audioTrack$)
	const audioDeviceId = alwaysOnAudioStreamTrack?.getSettings().deviceId
	const audioEnabled$ = useStateObservable(audioEnabled)
	const publicAudioTrack$ = useMemo(
		() =>
			combineLatest([audioEnabled$, audioTrack$, mutedAudioTrack$]).pipe(
				map(([enabled, alwaysOnTrack, mutedTrack]) =>
					enabled ? alwaysOnTrack : mutedTrack
				),
				shareReplay({
					refCount: true,
					bufferSize: 1,
				})
			),
		[audioEnabled$, audioTrack$, mutedAudioTrack$]
	)
	const audioStreamTrack = useSubscribedState(publicAudioTrack$)

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
	const screenShareVideoTrack = useSubscribedState(screenShareVideoTrack$)

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
