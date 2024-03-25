import { useCallback, useEffect, useMemo, useState } from 'react'

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

export default function useStageManager<Actor extends { id: string }>(
	actors: Actor[],
	limit: number
) {
	const [actorsOnStage, setActorsOnStage] = useState<Actor[]>(
		actors.slice(0, limit)
	)
	const [activityRecord, setActivityRecord] = useState<Record<string, number>>(
		{}
	)

	const recordActivity = useCallback((actor: Actor) => {
		setActivityRecord((ah) => ({ ...ah, [actor.id]: Date.now() }))
	}, [])

	const actorsThatShouldBeOnStage = useMemo(
		() =>
			[...actors]
				.sort(
					(a, b) => (activityRecord[b.id] ?? 0) - (activityRecord[a.id] ?? 0)
				)
				.slice(0, limit),
		[activityRecord, actors, limit]
	)

	const newUsers = useMemo(
		() => actors.filter((a) => activityRecord[a.id] === undefined),
		[activityRecord, actors]
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
