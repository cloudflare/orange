import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useNavigate } from '@remix-run/react'
import type { FC } from 'react'
import { Button } from './Button'
import { Icon } from './Icon/Icon'
import { Tooltip } from './Tooltip'

interface LeaveRoomButtonProps {}

export const LeaveRoomButton: FC<LeaveRoomButtonProps> = () => {
	const navigate = useNavigate()
	return (
		<Tooltip content="Leave">
			<Button
				displayType="danger"
				onClick={() => {
					navigate('/')
				}}
			>
				<VisuallyHidden>Leave</VisuallyHidden>
				<Icon type="phoneXMark" />
			</Button>
		</Tooltip>
	)
}
