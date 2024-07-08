import { useMemo, useState } from 'react'
import { useLocalStorage, useUnmount } from 'react-use'
import {
	catchError,
	combineLatest,
	of,
	shareReplay,
	switchMap,
	tap,
} from 'rxjs'
import invariant from 'tiny-invariant'
import { blackCanvasStreamTrack } from '~/utils/blackCanvasStreamTrack'
import blurVideoTrack from '~/utils/blurVideoTrack'
import { createEmptyAudioTrack } from '~/utils/createEmptyAudioTrack'
import keyInObject from '~/utils/keyInObject'
import type { Mode } from '~/utils/mode'
import noiseSuppression from '~/utils/noiseSuppression'
import { prependDeviceToPrioritizeList } from '~/utils/rxjs/devicePrioritization'
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
	const [screenShareStream, setScreenShareStream] = useState<MediaStream>()
	const [screenShareEnabled, setScreenShareEnabled] = useState(false)
	const [videoUnavailableReason, setVideoUnavailableReason] =
		useState<UserMediaError>()
	const [audioUnavailableReason, setAudioUnavailableReason] =
		useState<UserMediaError>()
	const [screenshareUnavailableReason, setScreenshareUnavailableReason] =
		useState<UserMediaError>()

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
									}),
									catchError(() => of(undefined))
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

	const turnMicOff = () => {
		setAudioEnabled(false)
	}

	const turnMicOn = async () => {
		setAudioEnabled(true)
	}

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
				}),
				catchError(() => of(undefined))
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

	useUnmount(() => {
		screenShareStream?.getTracks().forEach((t) => t.stop())
	})

	const turnCameraOn = () => {
		setVideoEnabled(true)
	}

	const turnCameraOff = () => {
		setVideoEnabled(false)
	}

	const startScreenShare = () => {
		navigator.mediaDevices
			.getDisplayMedia()
			.then((ms) => {
				ms.getVideoTracks().forEach((track) => {
					if ('contentHint' in track) {
						// optimize for legibility in shared screen
						track.contentHint = 'text'
					}
				})
				setScreenShareStream(ms)
				setScreenshareUnavailableReason(undefined)
				ms.getVideoTracks()[0].addEventListener('ended', () => {
					setScreenShareStream(undefined)
					setScreenShareEnabled(false)
				})
				setScreenShareEnabled(true)
			})
			.catch((e: Error) => {
				setScreenShareEnabled(false)
				invariant(keyInObject(errorMessageMap, e.name))
				setScreenshareUnavailableReason(e.name)
			})
	}

	const endScreenShare = () => {
		if (screenShareStream)
			screenShareStream.getTracks().forEach((t) => t.stop())
		setScreenShareEnabled(false)
		setScreenShareStream(undefined)
	}

	const screenShareVideoTrack = screenShareStream?.getVideoTracks()[0]

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

	const alwaysOnAudioStreamTrack = useSubscribedState(audioTrack$)
	const mutedAudioStreamTrack = useMemo(() => createEmptyAudioTrack(), [])
	const videoDeviceId = videoTrack?.getSettings().deviceId
	const audioDeviceId = alwaysOnAudioStreamTrack?.getSettings().deviceId

	return {
		turnMicOn,
		turnMicOff,
		audioStreamTrack: audioEnabled
			? alwaysOnAudioStreamTrack
			: mutedAudioStreamTrack,
		audioMonitorStreamTrack: alwaysOnAudioStreamTrack,
		audioEnabled,
		audioUnavailableReason,
		turnCameraOn,
		turnCameraOff,
		videoStreamTrack: videoTrack,
		videoEnabled,
		videoUnavailableReason,
		startScreenShare,
		endScreenShare,
		screenShareVideoTrack,
		screenShareEnabled,
		screenshareUnavailableReason,
		audioDeviceId,
		setAudioDeviceId,
		setVideoDeviceId,
		videoDeviceId,
		blurVideo,
		setBlurVideo,
		suppressNoise,
		setSuppressNoise,
		videoTrack$,
	}
}

export type UserMedia = ReturnType<typeof useUserMedia>
