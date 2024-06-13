import type { FC } from 'react'
import { playSound } from '~/utils/playSound'
import { Button } from './Button'
import { Icon } from './Icon/Icon'
import { Tooltip } from './Tooltip'

interface RaiseHandButtonProps {
	raisedHand: boolean
	onClick: () => void
}

export const RaiseHandButton: FC<RaiseHandButtonProps> = ({
	raisedHand,
	onClick,
}) => (
	<Tooltip content={raisedHand ? 'Lower hand' : 'Raise Hand'}>
		<Button
			displayType={raisedHand ? 'primary' : 'secondary'}
			onClick={(_e) => {
				onClick && onClick()
				if (!raisedHand) playSound('raiseHand')
			}}
		>
			<Icon type="handRaised" />
		</Button>
	</Tooltip>
)
