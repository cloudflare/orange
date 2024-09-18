import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useNavigate } from '@remix-run/react'
import type { FC } from 'react'
import { Button } from './Button'
import { Icon } from './Icon/Icon'
import { Tooltip } from './Tooltip'

interface LeaveRoomButtonProps {
	navigateToFeedbackPage: boolean
}

export const LeaveRoomButton: FC<LeaveRoomButtonProps> = ({
	navigateToFeedbackPage,
}) => {
	const navigate = useNavigate()
	return (
		<Tooltip content="Leave">
			<Button
				displayType="danger"
				onClick={() => {
					navigate(navigateToFeedbackPage ? '/call-quality-feedback' : '/')
				}}
			>
				<VisuallyHidden>Leave</VisuallyHidden>
				<Icon type="phoneXMark" />
			</Button>
		</Tooltip>
	)
}
