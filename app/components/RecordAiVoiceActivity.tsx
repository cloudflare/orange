import { useEffect } from 'react'
import useIsSpeaking from '~/hooks/useIsSpeaking'
import type { User } from '~/types/Messages'
import { usePulledAudioTrack } from './PullAudioTracks'

export function RecordAiVoiceActivity(props: {
	user: User
	recordActivity: (user: User) => void
}) {
	const audioTrack = usePulledAudioTrack(props.user.tracks.audio)
	const isSpeaking = useIsSpeaking(audioTrack)

	useEffect(() => {
		if (isSpeaking) {
			props.recordActivity(props.user)
		}
	}, [isSpeaking, props])

	return null
}
