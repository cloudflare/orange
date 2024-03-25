import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useEffect, useState } from 'react'
import { OptionalLink } from '~/components/OptionalLink'
import Toast, { useDispatchToast } from '~/components/Toast'
import type { User } from '~/types/Messages'
import populateTraceLink from '~/utils/populateTraceLink'
import { useRoomContext } from './useRoomContext'
import { useUserMetadata } from './useUserMetadata'

function UserJoinedOrLeftToast(props: { user: User; type: 'joined' | 'left' }) {
	const { traceLink } = useRoomContext()
	const { data } = useUserMetadata(props.user.name)
	return (
		<div className="flex items-center justify-center gap-2 text-sm">
			<Toast.Title>
				<OptionalLink
					href={
						props.user.transceiverSessionId
							? populateTraceLink(props.user.transceiverSessionId, traceLink)
							: undefined
					}
					target="_blank"
					rel="noopener noreferrer"
				>
					{data?.displayName}
				</OptionalLink>{' '}
				{props.type}
			</Toast.Title>
			<Toast.Close className="flex items-center justify-center w-5 h-5 px-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-600">
				<span aria-hidden>×</span>
				<VisuallyHidden>Dismiss</VisuallyHidden>
			</Toast.Close>
		</div>
	)
}

export function useUserJoinLeaveToasts(users: User[]) {
	const [trackedUsers, setTrackedUsers] = useState(users)
	const dispatchToast = useDispatchToast()

	useEffect(() => {
		const newUsers = users.filter(
			(u) => !trackedUsers.some((tu) => tu.id === u.id)
		)

		const usersLeft = trackedUsers.filter(
			(u) => !users.some((tu) => tu.id === u.id)
		)

		newUsers.forEach((u) =>
			dispatchToast(<UserJoinedOrLeftToast user={u} type="joined" />)
		)

		usersLeft.forEach((u) =>
			dispatchToast(<UserJoinedOrLeftToast user={u} type="left" />)
		)
	}, [dispatchToast, trackedUsers, users])

	useEffect(() => {
		setTrackedUsers(users)
	}, [users])
}
