import type { FC } from 'react'
import { useVideoInputDeviceId } from '~/hooks/globalPersistedState'
import useMediaDevices from '~/hooks/useMediaDevices'
import { useRoomContext } from '~/hooks/useRoomContext'
import { errorMessageMap } from '~/hooks/useUserMedia'
import { Option, Select } from './Select'

export const VideoInputSelector: FC<{ id?: string }> = ({ id }) => {
	const [videoDeviceId, setVideoDeviceId] = useVideoInputDeviceId()
	const videoInputDevices = useMediaDevices((d) => d.kind === 'videoinput')

	const {
		userMedia: { videoUnavailableReason },
	} = useRoomContext()

	if (videoUnavailableReason) {
		return (
			<div className="max-w-[40ch]">
				<Select
					tooltipContent={errorMessageMap[videoUnavailableReason]}
					id={id}
					defaultValue="unavailable"
				>
					<Option value={'unavailable'}>(Unavailable)</Option>
				</Select>
			</div>
		)
	}

	return (
		<div className="max-w-[40ch]">
			<Select value={videoDeviceId} onValueChange={setVideoDeviceId} id={id}>
				{videoInputDevices.map((d) => (
					<Option key={d.deviceId} value={d.deviceId}>
						{d.label}
					</Option>
				))}
			</Select>
		</div>
	)
}
