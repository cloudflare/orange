import type { FC } from 'react'
import { useAudioInputDeviceId } from '~/hooks/globalPersistedState'
import useMediaDevices from '~/hooks/useMediaDevices'
import { useRoomContext } from '~/hooks/useRoomContext'
import { errorMessageMap } from '~/hooks/useUserMedia'
import { Option, Select } from './Select'

export const AudioInputSelector: FC<{ id?: string }> = ({ id }) => {
	const audioInputDevices = useMediaDevices((d) => d.kind === 'audioinput')
	const [audioDeviceId, setAudioDeviceId] = useAudioInputDeviceId()

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

	if (!audioDeviceId) return null

	return (
		<div className="max-w-[40ch]">
			<Select id={id} value={audioDeviceId} onValueChange={setAudioDeviceId}>
				{audioInputDevices.map((d) => (
					<Option key={d.deviceId} value={d.deviceId}>
						{d.label}
					</Option>
				))}
			</Select>
		</div>
	)
}
