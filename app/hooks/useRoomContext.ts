import { useOutletContext } from '@remix-run/react'
import type { Dispatch, SetStateAction } from 'react'
import type { UserMedia } from '~/hooks/useUserMedia'
import type { PeerDebugInfo } from '~/utils/Peer.client'
import type { RxjsPeer } from '~/utils/rxjs/RxjsPeer.client'
import type useRoom from './useRoom'

export type RoomContextType = {
	traceLink?: string
	feedbackEnabled: boolean
	userDirectoryUrl?: string
	joined: boolean
	setJoined: Dispatch<SetStateAction<boolean>>
	userMedia: UserMedia
	peer: RxjsPeer
	peerDebugInfo?: PeerDebugInfo
	iceConnectionState: RTCIceConnectionState
	room: ReturnType<typeof useRoom>
	pushedTracks: {
		video?: string
		audio?: string
		screenshare?: string
	}
}

export function useRoomContext() {
	return useOutletContext<RoomContextType>()
}
