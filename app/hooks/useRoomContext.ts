import { useOutletContext } from '@remix-run/react'
import type { PartyTracks } from 'partytracks/client'
import type { Dispatch, SetStateAction } from 'react'
import type { UserMedia } from '~/hooks/useUserMedia'
import type useRoom from './useRoom'
import type { useRoomHistory } from './useRoomHistory'

export type RoomContextType = {
	traceLink?: string
	feedbackEnabled: boolean
	userDirectoryUrl?: string
	joined: boolean
	setJoined: Dispatch<SetStateAction<boolean>>
	pinnedTileIds: string[]
	setPinnedTileIds: Dispatch<SetStateAction<string[]>>
	showDebugInfo: boolean
	setShowDebugInfo: Dispatch<SetStateAction<boolean>>
	dataSaverMode: boolean
	setDataSaverMode: Dispatch<SetStateAction<boolean>>
	userMedia: UserMedia
	partyTracks: PartyTracks
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
