import { useObservableAsValue } from 'partytracks/react'
import { useMemo, type FC } from 'react'
import useMediaDevices from '~/hooks/useMediaDevices'
import { useRoomContext } from '~/hooks/useRoomContext'
import { errorMessageMap } from '~/hooks/useUserMedia'
import { getSortedDeviceListObservable } from '~/utils/rxjs/getDeviceListObservable'
import { Option, Select } from './Select'

export const VideoInputSelector: FC<{ id?: string }> = ({ id }) => {
	const videoInputDevices = useMediaDevices((d) => d.kind === 'videoinput')
	const sortedDeviceListObservable$ = useMemo(
		() => getSortedDeviceListObservable(),
		[]
	)
	const sortedDeviceList = useObservableAsValue(sortedDeviceListObservable$, [])

	const {
		userMedia: {
			videoUnavailableReason,
			videoDeviceId,
			setVideoDeviceId,
			videoEnabled,
		},
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

	// we can only rely on videoDeviceId when the webcam is enabled because
	// when it's not, the device id is being pulled from our black canvas track
	// so we will instead fall back to show the user's preferred webcam that
	// we would _try_ to acquire the next time they enable their webcam.
	const shownDeviceId = videoEnabled
		? videoDeviceId
		: sortedDeviceList.find((d) => d.kind === 'videoinput')?.deviceId

	return (
		<div className="max-w-[40ch]">
			<Select value={shownDeviceId} onValueChange={setVideoDeviceId} id={id}>
				{videoInputDevices.map((d) => (
					<Option key={d.deviceId} value={d.deviceId}>
						{d.label}
					</Option>
				))}
			</Select>
		</div>
	)
}
