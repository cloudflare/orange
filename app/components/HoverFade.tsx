import type { FC, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { cn } from '~/utils/style'

interface HoverFadeProps {
	timeout?: number
	className?: string
	children?: ReactNode
}

export const HoverFade: FC<HoverFadeProps> = ({
	timeout = 2000,
	children,
	className,
}) => {
	const [activity, setActivity] = useState(0)
	const [visible, setVisible] = useState(false)

	useEffect(() => {
		let mounted = true
		if (visible) {
			const t = setTimeout(() => {
				if (mounted) setVisible(false)
			}, timeout)

			return () => {
				clearTimeout(t)
			}
		}
		// include activity to reset timeout when new activity is recorded
	}, [timeout, visible, activity])

	return (
		<div
			className={cn('hover-fade', !visible && 'inactive', className)}
			// visible={visible}
			onPointerLeave={() => {
				setVisible(false)
			}}
			onPointerMove={() => {
				setVisible(true)
				setActivity(Date.now())
			}}
		>
			{children}
		</div>
	)
}
