import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '~/types/Messages'

/**
 * Returns an updated list with as few
 * changes as possible to the stable list.
 *
 * Items that are not in the new roster will
 * be dropped with their positions being filled
 * by new items.
 *
 */
export const resolveRoster = <T extends { id: string }>(
	currentRoster: T[],
	newRoster: T[]
) => {
	const newRosterMap = new Map(newRoster.map((item) => [item.id, item]))
	const currentRosterMap = new Map(currentRoster.map((item) => [item.id, item]))
	const remainingNewItems = newRoster.filter(
		({ id }) => !currentRosterMap.has(id)
	)
	return currentRoster
		.reduce((acc: T[], currentRosterItem) => {
			const item = newRosterMap.get(currentRosterItem.id)
			if (item === undefined) {
				const firstNewItem = remainingNewItems[0]
				if (!firstNewItem) return acc
				acc.push(firstNewItem)
				remainingNewItems.splice(0, 1)
			} else {
				acc.push(item)
			}
			return acc
		}, [])
		.concat(remainingNewItems)
}

export const screenshareSuffix = '_screenshare'

export default function useStageManager(
	users: User[],
	limit: number,
	self?: User
) {
	const usersAndScreenshares = useMemo(
		() =>
			users.concat(self ? [self] : []).flatMap((u) =>
				u.tracks.screenshare
					? [
							u,
							{
								...u,
								id: u.id + screenshareSuffix,
								tracks: {
									...u.tracks,
									video: u.tracks.screenshare,
									videoEnabled: u.tracks.screenShareEnabled,
								},
							},
						]
					: [u]
			),
		[self, users]
	)

	const [actorsOnStage, setActorsOnStage] = useState<User[]>(
		usersAndScreenshares.slice(0, limit)
	)
	const [activityRecord, setActivityRecord] = useState<Record<string, number>>(
		{}
	)

	const recordActivity = useCallback((actor: User) => {
		setActivityRecord((ah) => ({ ...ah, [actor.id]: Date.now() }))
	}, [])

	const actorsThatShouldBeOnStage = useMemo(
		() =>
			[...usersAndScreenshares]
				.sort((a, b) => {
					// prioritize self
					if (a.id === self?.id) return -1
					if (b.id === self?.id) return 1

					// prioritize screenshares
					if (
						a.id.includes(screenshareSuffix) &&
						!b.id.includes(screenshareSuffix)
					)
						return -1
					if (
						!a.id.includes(screenshareSuffix) &&
						b.id.includes(screenshareSuffix)
					)
						return 1

					// sort by activity
					return (activityRecord[b.id] ?? 0) - (activityRecord[a.id] ?? 0)
				})
				.slice(0, limit),
		[activityRecord, limit, self?.id, usersAndScreenshares]
	)

	const newUsers = useMemo(
		() =>
			usersAndScreenshares.filter((a) => activityRecord[a.id] === undefined),
		[activityRecord, usersAndScreenshares]
	)

	useEffect(() => {
		newUsers.forEach(recordActivity)
	}, [newUsers, recordActivity])

	useEffect(() => {
		setActorsOnStage((actorsAlreadyOnStage) =>
			resolveRoster(actorsAlreadyOnStage, actorsThatShouldBeOnStage)
		)
	}, [actorsThatShouldBeOnStage, limit])

	return { actorsOnStage, recordActivity }
}
