import { useState } from 'react'
import type { User } from '~/types/Messages'
import { cn } from '~/utils/style'
import { Icon } from './Icon/Icon'
import { Tooltip } from './Tooltip'

export function ConnectionInformation(props: { user: User }) {
	const { inboundPacketLoss, outboundPacketLoss } =
		props.user.connectionInformation
	const [open, setOpen] = useState(false)

	const inbound = (inboundPacketLoss * 100).toFixed(2)
	const outbound = (outboundPacketLoss * 100).toFixed(2)

	const connectionGood = inboundPacketLoss <= 0.01 && outboundPacketLoss <= 0.01
	const connectionUnstable =
		(inboundPacketLoss > 0.01 && inboundPacketLoss <= 0.03) ||
		(outboundPacketLoss > 0.01 && outboundPacketLoss <= 0.03)
	const connectionBad = inboundPacketLoss > 0.03 || outboundPacketLoss > 0.03

	return (
		<Tooltip
			open={open}
			onOpenChange={setOpen}
			content={
				<div className="text-gray-700 dark:text-gray-400">
					<div>Packet Loss</div>
					<div className="flex gap-4">
						<div className="flex items-center gap-1">
							<div className="sr-only">Outbound</div>
							<Icon
								className="text-gray-400 dark:text-gray-300"
								type="ArrowUpOnSquareIcon"
							/>
							<span>{outbound}%</span>
						</div>
						<div className="flex items-center gap-1">
							<div className="sr-only">Inbound</div>
							<Icon
								className="text-gray-400 dark:text-gray-300"
								type="ArrowDownOnSquareIcon"
							/>
							<span>{inbound}%</span>
						</div>
					</div>
				</div>
			}
		>
			<button className="flex items-center" onClick={() => setOpen(!open)}>
				<Icon
					className={cn(
						connectionGood && 'text-green-400',
						connectionUnstable && 'text-yellow-400',
						connectionBad && 'text-red-400'
					)}
					type={connectionBad ? 'SignalSlashIcon' : 'SignalIcon'}
				/>
			</button>
		</Tooltip>
	)
}
