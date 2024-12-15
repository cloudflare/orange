import { useEffect, useMemo, useRef, useState } from 'react'
import invariant from 'tiny-invariant'
import { useRoomContext } from '~/hooks/useRoomContext'
import { useUserMetadata } from '~/hooks/useUserMetadata'
import type { ClientMessage, ServerMessage } from '~/types/Messages'
import {
	createInaudibleAudioTrack,
	createMutedTrack,
} from '~/utils/createInaudibleAudioTrack'
import { playSound } from '~/utils/playSound'
import { Button } from './Button'
import { Spinner } from './Spinner'

function useKeyIsHeldDown(key: string) {
	const [keyIsHeldDown, setKeyIsHeldDown] = useState(false)

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() === key.toLowerCase()) {
				setKeyIsHeldDown(true)
			}
		}

		const onKeyUp = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() === key.toLowerCase()) {
				setKeyIsHeldDown(false)
			}
		}

		document.addEventListener('keydown', onKeyDown)
		document.addEventListener('keyup', onKeyUp)

		return () => {
			document.removeEventListener('keydown', onKeyDown)
			document.removeEventListener('keyup', onKeyUp)
		}
	}, [key])

	return keyIsHeldDown
}

export function AiButton() {
	const {
		userMedia: { audioStreamTrack, turnMicOn },
		room: {
			websocket,
			roomState: {
				ai: { enabled: aiEnabled, connectionPending, error, controllingUser },
				users,
			},
		},
	} = useRoomContext()
	const audioRef = useRef<HTMLAudioElement>(null)
	const [connected, setConnected] = useState(false)
	const [peerConnectionConnecting, setPeerConnectionConnecting] =
		useState(false)
	const hasControl = controllingUser === websocket.id
	const holdingTalkButton = useKeyIsHeldDown('a')
	const mutedTrack = useMemo(() => createMutedTrack(), [])

	const transceiverRef = useRef<RTCRtpTransceiver | null>(null)

	useEffect(() => {
		if (!aiEnabled) return
		setPeerConnectionConnecting(true)
		const peerConnection = new RTCPeerConnection()
		transceiverRef.current = peerConnection.addTransceiver(
			// this track has a little bit of noise on it to
			// force some data to be sent over the wire
			createInaudibleAudioTrack(),
			{
				direction: 'sendrecv',
			}
		)
		peerConnection.ontrack = (e) => {
			if (audioRef.current) {
				audioRef.current.srcObject = e.streams[0]
				setConnected(true)
				setPeerConnectionConnecting(false)
			}
		}

		const websocketHandler = async (e: MessageEvent) => {
			const message = JSON.parse(e.data) as ServerMessage
			if (message.type === 'aiSdp') {
				await peerConnection.setRemoteDescription({
					type: 'answer',
					sdp: message.sdp,
				})
			}
		}

		websocket.addEventListener('message', websocketHandler)
		;(async () => {
			const offer = await peerConnection.createOffer()
			await peerConnection.setLocalDescription(offer)
			invariant(offer.sdp)
			websocket.send(
				JSON.stringify({
					type: 'establishAiPeerConnection',
					sdp: offer.sdp,
				} satisfies ClientMessage)
			)
		})()

		return () => {
			websocket.removeEventListener('message', websocketHandler)
			peerConnection.close()
		}

		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [aiEnabled, websocket])

	const aiAudioTrack = useMemo(
		() => (holdingTalkButton ? audioStreamTrack : mutedTrack),
		[audioStreamTrack, holdingTalkButton, mutedTrack]
	)

	useEffect(() => {
		if (!aiEnabled || !aiAudioTrack) return
		transceiverRef.current?.sender.replaceTrack(aiAudioTrack)
	}, [aiAudioTrack, aiEnabled])

	useEffect(() => {
		if (!aiEnabled) return
		if (holdingTalkButton && !hasControl && controllingUser === undefined) {
			websocket.send(
				JSON.stringify({ type: 'requestAiControl' } satisfies ClientMessage)
			)
		}
	}, [
		aiEnabled,
		audioStreamTrack,
		controllingUser,
		hasControl,
		holdingTalkButton,
		websocket,
	])

	useEffect(() => {
		if (holdingTalkButton && aiEnabled) {
			turnMicOn()
		}
	}, [aiEnabled, holdingTalkButton, turnMicOn])

	useEffect(() => {
		if (hasControl && !holdingTalkButton) {
			websocket.send(
				JSON.stringify({
					type: 'relenquishAiControl',
				} satisfies ClientMessage)
			)
		}
	}, [hasControl, holdingTalkButton, websocket])

	useEffect(() => {
		if (hasControl) {
			playSound('raiseHand')
		}
	}, [hasControl])

	const controllingUserName = useUserMetadata(
		users.find((u) => u.id === controllingUser)?.name ?? ''
	)

	return (
		<>
			{error && <span className="text-red-800 dark:text-red-500">{error}</span>}
			{connected ? (
				<>
					{hasControl ? (
						<span>Speaking to AI...</span>
					) : controllingUser ? (
						<span>
							{controllingUserName.data?.displayName} is speaking to AI
						</span>
					) : (
						<span>Hold "a" to speak to AI</span>
					)}
				</>
			) : (
				<Button
					onClick={() =>
						websocket.send(
							JSON.stringify({ type: 'enableAi' } satisfies ClientMessage)
						)
					}
					className="text-xs flex items-center gap-2"
					disabled={connectionPending || peerConnectionConnecting}
				>
					{(connectionPending || peerConnectionConnecting) && <Spinner />}
					<span>
						{connectionPending || peerConnectionConnecting
							? 'Connecting...'
							: 'Invite AI'}
					</span>
				</Button>
			)}
			<audio autoPlay ref={audioRef} className="hidden" />
		</>
	)
}
