import type { FC } from 'react'
import { useAudioOutputDeviceId } from '~/hooks/globalPersistedState'
import useMediaDevices from '~/hooks/useMediaDevices'
import { useRoomContext } from '~/hooks/useRoomContext'
import { errorMessageMap } from '~/hooks/useUserMedia'
import { Option, Select } from './Select'

export const AudioOutputSelector: FC<{ id?: string }> = ({ id }) => {
	const audioOutputDevices = useMediaDevices((d) => d.kind === 'audiooutput')
	const [audioDeviceId, setAudioDeviceId] = useAudioOutputDeviceId()

	const {
		userMedia: { audioUnavailableReason },
	} = useRoomContext()

	if (audioUnavailableReason) {
		return (
			<div className="max-w-[40ch]">
				<Select
					tooltipContent={errorMessageMap[audioUnavailableReason]}
					id={id}
					defaultValue="unavailable"
				>
					<Option value={'unavailable'}>(Unavailable)</Option>
				</Select>
			</div>
		)
	}

	if (!audioDeviceId) return <span>null</span>

	return (
		<div className="max-w-[40ch]">
			<Select id={id} value={audioDeviceId} onValueChange={setAudioDeviceId}>
				{audioOutputDevices.map((d) => (
					<Option key={d.deviceId} value={d.deviceId}>
						{d.label}
					</Option>
				))}
			</Select>
		</div>
	)
}
