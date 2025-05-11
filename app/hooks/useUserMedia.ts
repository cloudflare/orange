import { getCamera, getMic, getScreenshare } from 'partytracks/client'
import { useObservable, useObservableAsValue } from 'partytracks/react'
import { useCallback, useEffect, useState } from 'react'
import { useLocalStorage } from 'react-use'
import blurVideoTrack from '~/utils/blurVideoTrack'
import { mode } from '~/utils/mode'
import noiseSuppression from '~/utils/noiseSuppression'

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
export const mic = getMic({ broadcasting: broadcastByDefault })
export const camera = getCamera({ broadcasting: true })
export const screenshare = getScreenshare({ audio: false })

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
	const screenShareIsBroadcasting = useObservableAsValue(
		screenshare.video.isBroadcasting$,
		false
	)
	const startScreenShare = useCallback(() => {
		screenshare.audio.startBroadcasting()
		screenshare.video.startBroadcasting()
	}, [])
	const endScreenShare = useCallback(() => {
		screenshare.audio.stopBroadcasting()
		screenshare.video.stopBroadcasting()
	}, [])

	return {
		screenShareEnabled: screenShareIsBroadcasting,
		startScreenShare,
		endScreenShare,
		screenShareVideoTrack$: screenshare.video.broadcastTrack$,
		screenShareVideoTrack: useObservableAsValue(
			screenshare.video.broadcastTrack$
		),
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

	useObservable(mic.error$, (e) => {
		const reason =
			e.name in errorMessageMap ? (e.name as UserMediaError) : 'UnknownError'
		if (reason === 'UnknownError') {
			console.error('Unknown error getting audio track: ', e)
		}
		setAudioUnavailableReason(reason)
		mic.stopBroadcasting()
	})

	useObservable(camera.error$, (e) => {
		const reason =
			e.name in errorMessageMap ? (e.name as UserMediaError) : 'UnknownError'
		if (reason === 'UnknownError') {
			console.error('Unknown error getting video track: ', e)
		}
		setVideoUnavailableReason(reason)
		camera.stopBroadcasting()
	})

	return {
		turnMicOn: mic.startBroadcasting,
		turnMicOff: mic.stopBroadcasting,
		audioStreamTrack: useObservableAsValue(mic.broadcastTrack$),
		audioMonitorStreamTrack: useObservableAsValue(mic.localMonitorTrack$),
		audioEnabled: useObservableAsValue(mic.isBroadcasting$, broadcastByDefault),
		audioUnavailableReason,
		publicAudioTrack$: mic.broadcastTrack$,
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
		videoTrack$: camera.broadcastTrack$,
		videoStreamTrack: useObservableAsValue(camera.broadcastTrack$),

		startScreenShare,
		endScreenShare,
		screenShareVideoTrack,
		screenShareEnabled,
		screenShareVideoTrack$,
	}
}

export type UserMedia = ReturnType<typeof useUserMedia>
