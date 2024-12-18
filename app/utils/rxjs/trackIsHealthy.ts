export async function trackIsHealthy(
	track: MediaStreamTrack
): Promise<boolean> {
	console.info(`👩🏻‍⚕️ Checking track health...`)

	if (track.enabled) {
		// TODO:
		// if (track.kind === "audio") {
		//   test audio stream with web audio api
		// }
		//
		// if (track.kind === "video") {
		//   draw to canvas and check if all black pixels
		// }
	}

	const randomFailuresEnabled =
		localStorage.getItem('flags.randomTrackFailuresEnabled') === 'true'

	const randomFailure = randomFailuresEnabled && Math.random() < 0.2

	if (randomFailure) {
		console.log('🎲 Random track failure!')
	}

	const healthy = !track.muted && track.readyState === 'live' && !randomFailure

	try {
		if (!healthy) {
			const devices = await navigator.mediaDevices.enumerateDevices()
			const deviceFromTrack = devices.find(
				(device) => device.deviceId === track.getSettings().deviceId
			)
			console.warn(
				`👩🏻‍⚕️ Track from ${deviceFromTrack?.label ?? "unkonwn device (enumerateDevices didn't find a matching device id)"} is unhealthy!`
			)
			console.warn(
				`👩🏻‍⚕️ track.readyState: ${track.readyState} and track.muted: ${track.muted}`,
				track
			)
		}
	} catch (e) {
		console.error('Error getting device info for unhealthy track', e, track)
	}

	console.info(`👩🏻‍⚕️ track is ${healthy ? 'healthy' : 'unhealthy'}!`)
	return healthy
}
