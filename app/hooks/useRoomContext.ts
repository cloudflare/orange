import { useOutletContext } from '@remix-run/react'
import type { Dispatch, SetStateAction } from 'react'
import type { UserMedia } from '~/hooks/useUserMedia'
import type { RxjsPeer } from '~/utils/rxjs/RxjsPeer.client'
import type useRoom from './useRoom'
import type { useRoomHistory } from './useRoomHistory'

export type RoomContextType = {
	traceLink?: string
	feedbackEnabled: boolean
	userDirectoryUrl?: string
	joined: boolean
	setJoined: Dispatch<SetStateAction<boolean>>
	dataSaverMode: boolean
	setDataSaverMode: Dispatch<SetStateAction<boolean>>
	userMedia: UserMedia
	peer: RxjsPeer
	iceConnectionState: RTCIceConnectionState
	room: ReturnType<typeof useRoom>
	roomHistory: ReturnType<typeof useRoomHistory>
	pushedTracks: {
		video?: string
		audio?: string
		screenshare?: string
	}
}

export function useRoomContext() {
	return useOutletContext<RoomContextType>()
}
