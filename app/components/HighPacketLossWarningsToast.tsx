import { useObservableAsValue } from 'partytracks/react'
import { useMemo } from 'react'
import Toast, { Root } from '~/components/Toast'
import { useConditionForAtLeast } from '~/hooks/useConditionForAtLeast'
import { getPacketLossStats$ } from '~/utils/rxjs/getPacketLossStats$'
import { useRoomContext } from '../hooks/useRoomContext'
import { Icon } from './Icon/Icon'

function useStats() {
	const { partyTracks } = useRoomContext()
	const stats$ = useMemo(
		() => getPacketLossStats$(partyTracks.peerConnection$),
		[partyTracks.peerConnection$]
	)
	const stats = useObservableAsValue(stats$, {
		inboundPacketLossPercentage: 0,
		outboundPacketLossPercentage: 0,
	})

	return stats
}

export function HighPacketLossWarningsToast() {
	const { inboundPacketLossPercentage, outboundPacketLossPercentage } =
		useStats()

	const hasIssues = useConditionForAtLeast(
		inboundPacketLossPercentage !== undefined &&
			outboundPacketLossPercentage !== undefined &&
			(inboundPacketLossPercentage > 0.05 ||
				outboundPacketLossPercentage > 0.05),
		5000
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

	return (
		<Root duration={Infinity}>
			<div className="space-y-2 text-sm">
				<div className="font-bold">
					<Toast.Title className="flex items-center gap-2">
						<Icon type="SignalSlashIcon" />
						Unstable connection
					</Toast.Title>
				</div>
				<Toast.Description>Call quality may be affected.</Toast.Description>
			</div>
		</Root>
	)
}
