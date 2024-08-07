import Toast, { Root } from '~/components/Toast'
import { useConditionForAtLeast } from '~/hooks/useConditionForAtLeast'
import { useRoomContext } from '~/hooks/useRoomContext'
import { Icon } from './Icon/Icon'

export function HighPacketLossWarningsToast() {
	const {
		connectionStats: {
			inboundPacketLossPercentage,
			outboundPacketLossPercentage,
		},
	} = useRoomContext()

	const hasIssues = useConditionForAtLeast(
		inboundPacketLossPercentage !== undefined &&
			outboundPacketLossPercentage !== undefined &&
			(inboundPacketLossPercentage > 0.01 ||
				outboundPacketLossPercentage > 0.01),
		3000
	)

	if (
		inboundPacketLossPercentage === undefined ||
		outboundPacketLossPercentage === undefined
	) {
		return null
	}

	if (!hasIssues) {
		return null
	}

	const inbound = (inboundPacketLossPercentage * 100).toFixed(2)
	const outbound = (outboundPacketLossPercentage * 100).toFixed(2)

	return (
		<Root duration={Infinity}>
			<div className="space-y-2 text-sm">
				<div className="font-bold">
					<Toast.Title className="flex items-center gap-2">
						<Icon type="WifiIcon" />
						Unstable connection
					</Toast.Title>
				</div>
				<Toast.Description className="space-y-2">
					<div>Call quality may be affected.</div>
					<div className="text-gray-500 dark:text-gray-200">
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
				</Toast.Description>
			</div>
		</Root>
	)
}
