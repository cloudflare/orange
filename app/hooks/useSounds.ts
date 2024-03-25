import { useEffect } from 'react'
import { useMount, usePrevious, useUnmount } from 'react-use'
import type { User } from '~/types/Messages'
import { playSound } from '~/utils/playSound'

export default function useSounds(users: User[]) {
	const previousUserCount = usePrevious(users.length)

	useEffect(() => {
		if (
			users.length > 5 ||
			previousUserCount === undefined ||
			previousUserCount === users.length
		)
			return
		if (users.length > previousUserCount) {
			playSound('join')
		} else {
			playSound('leave')
		}
	}, [previousUserCount, users.length])

	const raisedHandCound = users.filter((u) => u.raisedHand).length
	const previousHandRaisedCount = usePrevious(raisedHandCound)

	useEffect(() => {
		if (
			previousHandRaisedCount === undefined ||
			raisedHandCound === previousHandRaisedCount
		) {
			return
		}
		if (raisedHandCound > previousHandRaisedCount) {
			playSound('raiseHand')
		}
	}, [raisedHandCound, previousHandRaisedCount])

	useMount(() => {
		playSound('join')
	})

	useUnmount(() => {
		playSound('leave')
	})
}
