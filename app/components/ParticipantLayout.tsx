import { useId, useRef } from 'react'
import { Flipper } from 'react-flip-toolkit'
import type { User } from '~/types/Messages'
import { createGrid } from '~/utils/good-grid'
import { useGridDimensions } from '~/utils/good-grid/react'
import { Participant } from './Participant'

export function ParticipantLayout({
	users,
	gap,
}: {
	users: User[]
	gap: number
}) {
	const $el = useRef<HTMLDivElement>(null)

	// hook that listens to resize of the element
	// and returns it's dimensions
	const dimensions = useGridDimensions($el)

	const { width, height, getPosition } = createGrid({
		dimensions,
		count: users.length,
		aspectRatio: '4:3',
		gap,
	})

	const id = useId()

	if (users.length === 0) {
		return null
	}

	return (
		<Flipper flipKey={id + users.length}>
			<div
				className="absolute inset-[--gap] h-[--height] w-[--width] isolate flex flex-wrap justify-around"
				ref={$el}
				style={
					{
						'--gap': '-' + gap + 'px',
						height: `calc(100% + ${gap}px + ${gap}px`,
						width: `calc(100% + ${gap}px + ${gap}px`,
					} as any
				}
			>
				{users.map((user, i) => {
					const { top, left } = getPosition(i)
					return (
						<Participant
							style={{
								width,
								height,
								top,
								left,
								position: 'absolute',
								transition: '0.4s all',
							}}
							key={user.id}
							user={user}
						/>
					)
				})}
			</div>
		</Flipper>
	)
}
