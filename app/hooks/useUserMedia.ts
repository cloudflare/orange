import { useEffect, useMemo, useState } from 'react'
import { useLocalStorage, useUnmount } from 'react-use'
import invariant from 'tiny-invariant'
import { blackCanvasStreamTrack } from '~/utils/blackCanvasStreamTrack'
import blurVideoTrack from '~/utils/blurVideoTrack'
import { getUserMediaExtended } from '~/utils/getUserMedia'
import keyInObject from '~/utils/keyInObject'
import type { Mode } from '~/utils/mode'
import noiseSuppression from '~/utils/noiseSuppression'
import {
	useAudioInputDeviceId,
	useAudioInputDeviceLabel,
	useVideoInputDeviceId,
	useVideoInputDeviceLabel,
} from './globalPersistedState'

// export const userRejectedPermission = 'NotAllowedError'

export const errorMessageMap = {
	NotAllowedError:
		'Permission was denied. Grant permission and reload to enable.',
	NotFoundError: 'No device was found.',
	NotReadableError: 'Device is already in use.',
	OverconstrainedError: 'No device was found that meets constraints',
}

type UserMediaError = keyof typeof errorMessageMap

export default function useUserMedia(mode: Mode) {
	const [blurVideo, setBlurVideo] = useLocalStorage('blur-video', false)
	const [suppressNoise, setSuppressNoise] = useLocalStorage(
		'suppress-noise',
		false
	)
	const [audioDeviceId, setAudioDeviceId] = useAudioInputDeviceId()
	const [audioDeviceLabel, setAudioDeviceLabel] = useAudioInputDeviceLabel()
	const [videoDeviceId, setVideoDeviceId] = useVideoInputDeviceId()
	const [videoDeviceLabel, setVideoDeviceLabel] = useVideoInputDeviceLabel()
	const [audioStreamTrack, setAudioStreamTrack] = useState<MediaStreamTrack>()
	const [mutedAudioStreamTrack, setMutedAudioStreamTrack] =
		useState<MediaStreamTrack>()
	const [audioEnabled, setAudioEnabled] = useState(mode === 'production')
	const [videoStreamTrack, setVideoStreamTrack] = useState<MediaStreamTrack>()
	const [videoEnabled, setVideoEnabled] = useState(true)
	const [screenShareStream, setScreenShareStream] = useState<MediaStream>()
	const [screenShareEnabled, setScreenShareEnabled] = useState(false)
	const [videoUnavailableReason, setVideoUnavailableReason] =
		useState<UserMediaError>()
	const [audioUnavailableReason, setAudioUnavailableReason] =
		useState<UserMediaError>()
	const [screenshareUnavailableReason, setScreenshareUnavailableReason] =
		useState<UserMediaError>()

	const turnMicOff = () => {
		setAudioEnabled(false)
	}

	const turnMicOn = async () => {
		setAudioEnabled(true)
	}

	useEffect(() => {
		let mounted = true
		getUserMediaExtended({
			audio: audioDeviceId
				? { deviceId: audioDeviceId, label: audioDeviceLabel }
				: true,
		})
			.then(async (ms) => {
				if (!mounted) {
					ms.getTracks().forEach((t) => t.stop())
					return
				}
				const audio = ms.getAudioTracks()[0]
				const { deviceId } = audio.getSettings()
				setAudioDeviceId(deviceId)
				setAudioDeviceLabel(
					(await navigator.mediaDevices.enumerateDevices()).find(
						(d) => d.deviceId === deviceId
					)?.label
				)
				// this will fire if the device is disconnected
				// in which case we will switch to whatever the
				// default is.
				audio.addEventListener('ended', () => {
					setAudioDeviceId(undefined)
				})

				const audioTrack = suppressNoise ? noiseSuppression(audio) : audio

				setAudioStreamTrack((prevAudio) => {
					// release previous audio input device if
					// there was one
					if (prevAudio) prevAudio.stop()
					return audioTrack
				})
				setAudioUnavailableReason(undefined)
			})
			.catch((e: Error) => {
				if (!mounted) return
				setAudioEnabled(false)
				invariant(keyInObject(errorMessageMap, e.name))
				setAudioUnavailableReason(e.name)
			})

		getUserMediaExtended({
			audio: audioDeviceId ? { deviceId: audioDeviceId } : true,
		}).then((ms) => {
			if (!mounted) {
				ms.getTracks().forEach((t) => t.stop())
				return
			}
			const [mutedTrack] = ms.getAudioTracks()
			mutedTrack.enabled = false
			setMutedAudioStreamTrack(mutedTrack)
		})
		return () => {
			mounted = false
		}
	}, [
		suppressNoise,
		audioDeviceId,
		setAudioDeviceId,
		audioDeviceLabel,
		setAudioDeviceLabel,
	])

	useUnmount(() => {
		audioStreamTrack?.stop()
		mutedAudioStreamTrack?.stop()
		videoStreamTrack?.stop()
		screenShareStream?.getTracks().forEach((t) => t.stop())
	})

	const turnCameraOn = () => {
		setVideoEnabled(true)
	}

	const turnCameraOff = () => {
		setVideoEnabled(false)
	}

	useEffect(() => {
		let mounted = true
		if (videoEnabled) {
			getUserMediaExtended({
				video: videoDeviceId
					? { deviceId: videoDeviceId, label: videoDeviceLabel }
					: true,
			})
				.then(async (ms) => {
					if (!mounted) {
						ms.getTracks().forEach((t) => t.stop())
						return
					}
					const sourceTrack = ms.getVideoTracks()[0]
					const { deviceId } = sourceTrack.getSettings()
					setVideoDeviceId(deviceId)
					setVideoDeviceLabel(
						(await navigator.mediaDevices.enumerateDevices()).find(
							(d) => d.deviceId === deviceId
						)?.label
					)

					sourceTrack.addEventListener('ended', () => {
						setVideoDeviceId(undefined)
					})

					const videoTrack = blurVideo
						? await blurVideoTrack(sourceTrack)
						: sourceTrack

					setVideoStreamTrack((oldTrack) => {
						if (oldTrack) {
							oldTrack.stop()
						}
						return videoTrack
					})
					setVideoUnavailableReason(undefined)
				})
				.catch((e: Error) => {
					if (!mounted) return
					setVideoEnabled(false)
					invariant(keyInObject(errorMessageMap, e.name))
					setVideoUnavailableReason(e.name)
				})
		} else {
			setVideoStreamTrack((oldTrack) => {
				if (oldTrack) {
					const newTrack = blackCanvasStreamTrack(oldTrack)
					oldTrack.stop()
					return newTrack
				} else {
					return undefined
				}
			})
		}
		return () => {
			mounted = false
		}
	}, [
		blurVideo,
		setVideoDeviceId,
		setVideoDeviceLabel,
		videoDeviceId,
		videoDeviceLabel,
		videoEnabled,
	])

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

	const videoTrack = useMemo(
		() =>
			videoEnabled || !videoStreamTrack
				? videoStreamTrack
				: blackCanvasStreamTrack(videoStreamTrack),
		[videoEnabled, videoStreamTrack]
	)

	const screenShareVideoTrack = screenShareStream?.getVideoTracks()[0]

	return {
		turnMicOn,
		turnMicOff,
		audioStreamTrack: audioEnabled ? audioStreamTrack : mutedAudioStreamTrack,
		audioMonitorStreamTrack: audioStreamTrack,
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
	}
}

export type UserMedia = ReturnType<typeof useUserMedia>
