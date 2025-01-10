import { useObservableAsValue, useValueAsObservable } from 'partytracks/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { switchMap } from 'rxjs'
import { useRoomContext } from '~/hooks/useRoomContext'
import type { ClientMessage } from '~/types/Messages'
import { playSound } from '~/utils/playSound'
import { inaudibleAudioTrack$ } from '~/utils/rxjs/inaudibleAudioTrack$'
import { Button } from './Button'

function useButtonIsHeldDown({
	key,
	disabled,
}: {
	key: string
	disabled: boolean
}) {
	const [keyIsHeldDown, setKeyIsHeldDown] = useState(false)
	const buttonRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		const button = buttonRef.current
		let timeout = -1
		const setTrue = () => {
			if (!disabled) {
				setKeyIsHeldDown(true)
				clearTimeout(timeout)
			}
		}
		const setFalse = () => {
			timeout = window.setTimeout(() => {
				setKeyIsHeldDown(false)
			}, 200)
		}

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
		document.addEventListener('blur', setFalse)
		button?.addEventListener('pointerdown', setTrue)
		button?.addEventListener('pointerup', setFalse)

		return () => {
			clearTimeout(timeout)
			document.removeEventListener('keydown', onKeyDown)
			document.removeEventListener('keyup', onKeyUp)
			document.removeEventListener('blur', setFalse)
			button?.removeEventListener('pointerdown', setTrue)
			button?.removeEventListener('pointerup', setFalse)
		}
	}, [disabled, key])

	return [keyIsHeldDown, buttonRef] as const
}

export function AiPushToTalkButtion() {
	const {
		partyTracks,
		room: {
			websocket,
			roomState: {
				ai: { controllingUser },
			},
		},
		userMedia: { turnMicOn, publicAudioTrack$ },
	} = useRoomContext()
	const hasControl = controllingUser === websocket.id
	const disabled = !hasControl && controllingUser !== undefined
	const [holdingTalkButton, talkButtonRef] = useButtonIsHeldDown({
		key: 'a',
		disabled,
	})

	const holdingTalkButton$ = useValueAsObservable(holdingTalkButton)
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
		() => partyTracks.push(audioTrack$),
		[audioTrack$, partyTracks]
	)

	const pushedAiAudioTrack = useObservableAsValue(pushedAiAudioTrack$)

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

	useEffect(() => {
		if (controllingUser !== undefined) {
			playSound('aiReady')
		}
	}, [controllingUser])

	return (
		<Button
			className="text-xs select-none"
			disabled={disabled}
			ref={talkButtonRef}
		>
			{hasControl ? 'Speaking to Ai...' : 'Hold to talk to AI'}
		</Button>
	)
}
