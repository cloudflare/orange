import Toast, { Root } from '~/components/Toast'
import { useConditionForAtLeast } from '~/hooks/useConditionForAtLeast'
import { useRoomContext } from '../hooks/useRoomContext'
import { Icon } from './Icon/Icon'

export function IceDisconnectedToast() {
	const { iceConnectionState } = useRoomContext()

	const disconnectedForAtLeastTwoSeconds = useConditionForAtLeast(
		iceConnectionState === 'disconnected',
		2000
	)

	if (!disconnectedForAtLeastTwoSeconds) {
		return null
	}

	return (
		<Root duration={Infinity}>
			<div className="space-y-2 text-sm">
				<div className="font-bold">
					<Toast.Title className="flex items-center gap-2">
						<Icon type="WifiIcon" />
						ICE disconnected
					</Toast.Title>
				</div>
			</div>
		</Root>
	)
}
