import type { ApiHistoryEntry, PartyTracks } from 'partytracks/client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type useRoom from './useRoom'

interface UserSession {
	username: string
	sessionId: string
}

export interface RoomHistory {
	apiHistory: ApiHistoryEntry[]
	userSessions: UserSession[]
}

export function useRoomHistory(
	partyTracks: PartyTracks,
	room: ReturnType<typeof useRoom>
): RoomHistory {
	const [apiHistory, setApiHistory] = useState<ApiHistoryEntry[]>([])
	const [userSessionsWithoutTraceLinks, setUserSessions] = useState<
		UserSession[]
	>([])
	const sessionIdsRef = useRef(new Set<string>())

	useEffect(() => {
		const handleHistory = () => {
			setApiHistory(partyTracks.history.entries)
		}
		partyTracks.history.addEventListener('logentry', handleHistory)

		return () => {
			partyTracks.history.removeEventListener('logentry', handleHistory)
		}
	}, [partyTracks])

	useEffect(() => {
		room.otherUsers.forEach((user) => {
			if (user.transceiverSessionId === undefined) return
			if (sessionIdsRef.current.has(user.transceiverSessionId)) return
			sessionIdsRef.current.add(user.transceiverSessionId)
			const userSession = {
				sessionId: user.transceiverSessionId,
				username: user.name,
			} satisfies UserSession
			setUserSessions((s) => [...s, userSession])
		})
	}, [room.otherUsers])

	const userSessions = useMemo(
		() =>
			userSessionsWithoutTraceLinks.map((s) => ({
				...s,
			})),
		[userSessionsWithoutTraceLinks]
	)

	return {
		apiHistory,
		userSessions,
	}
}
