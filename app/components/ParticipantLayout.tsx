import { useId, useMemo } from 'react'
import { Flipper } from 'react-flip-toolkit'
import useMeasure from 'react-use/lib/useMeasure'
import type { User } from '~/types/Messages'
import { calculateLayout } from '~/utils/calculateLayout'
import { Participant } from './Participant'

export function ParticipantLayout(props: { users: User[] }) {
	const [containerRef, { width: containerWidth, height: containerHeight }] =
		useMeasure<HTMLDivElement>()
	const [firstFlexChildRef, { width: firstFlexChildWidth }] =
		useMeasure<HTMLDivElement>()
	const flexContainerWidth = useMemo(
		() =>
			100 /
				calculateLayout({
					count: props.users.length,
					height: containerHeight,
					width: containerWidth,
				}).cols +
			'%',
		[containerHeight, containerWidth, props.users.length]
	)
	const id = useId()

	if (props.users.length === 0) {
		return null
	}

	return (
		<Flipper flipKey={id + props.users.length}>
			<div
				className="absolute inset-0 h-full w-full isolate flex flex-wrap justify-around gap-[--gap]"
				style={
					{
						// the flex basis that is needed to achieve row layout
						'--flex-container-width': flexContainerWidth,
						// the size of the first user's flex container
						'--participant-max-width': firstFlexChildWidth + 'px',
					} as any
				}
				ref={containerRef}
			>
				{props.users.map((user, i) => (
					<Participant
						key={user.id}
						user={user}
						ref={i === 0 ? firstFlexChildRef : undefined}
					/>
				))}
			</div>
		</Flipper>
	)
}
