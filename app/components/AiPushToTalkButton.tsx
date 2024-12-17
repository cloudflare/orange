import { useEffect, useMemo, useRef, useState } from 'react'
import { switchMap } from 'rxjs'
import { useStateObservable, useSubscribedState } from '~/hooks/rxjsHooks'
import { useRoomContext } from '~/hooks/useRoomContext'
import type { ClientMessage } from '~/types/Messages'
import { inaudibleAudioTrack$ } from '~/utils/rxjs/inaudibleAudioTrack$'
import { Button } from './Button'

function useButtonIsHeldDown(key: string) {
	const [keyIsHeldDown, setKeyIsHeldDown] = useState(false)
	const buttonRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		const button = buttonRef.current
		const setTrue = () => setKeyIsHeldDown(true)
		const setFalse = () => setKeyIsHeldDown(false)

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() === key.toLowerCase()) {
				setTrue()
			}
		}

		const onKeyUp = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() === key.toLowerCase()) {
				setFalse()
			}
		}

		document.addEventListener('keydown', onKeyDown)
		document.addEventListener('keyup', onKeyUp)
		button?.addEventListener('pointerdown', setTrue)
		button?.addEventListener('pointerup', setFalse)

		return () => {
			document.removeEventListener('keydown', onKeyDown)
			document.removeEventListener('keyup', onKeyUp)
			button?.removeEventListener('pointerdown', setTrue)
			button?.removeEventListener('pointerup', setFalse)
		}
	}, [key])

	return [keyIsHeldDown, buttonRef] as const
}

export function AiPushToTalkButtion() {
	const {
		peer,
		room: {
			websocket,
			// roomState: { ai: { controllingUser } }
		},
		userMedia: { turnMicOn, publicAudioTrack$ },
	} = useRoomContext()
	// const hasControl = controllingUser === websocket.id
	const [holdingTalkButton, talkButtonRef] = useButtonIsHeldDown('a')

	const holdingTalkButton$ = useStateObservable(holdingTalkButton)
	const audioTrack$ = useMemo(
		() =>
			holdingTalkButton$.pipe(
				switchMap((talking) =>
					talking ? publicAudioTrack$ : inaudibleAudioTrack$
				)
			),
		[holdingTalkButton$, publicAudioTrack$]
	)

	const pushedAiAudioTrack$ = useMemo(
		() => peer.pushTrack(audioTrack$),
		[audioTrack$, peer]
	)

	const pushedAiAudioTrack = useSubscribedState(pushedAiAudioTrack$)

	useEffect(() => {
		if (holdingTalkButton && pushedAiAudioTrack) {
			turnMicOn()
			console.log('🤖 Requesting ai control')
			websocket.send(
				JSON.stringify({
					type: 'requestAiControl',
					track: pushedAiAudioTrack,
				} satisfies ClientMessage)
			)
		} else {
			console.log('🤖 Relinquishing ai control!')
			websocket.send(
				JSON.stringify({
					type: 'relenquishAiControl',
				} satisfies ClientMessage)
			)
		}
	}, [holdingTalkButton, pushedAiAudioTrack, turnMicOn, websocket])

	return <Button ref={talkButtonRef}>talk to AI</Button>
}
