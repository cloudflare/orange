export default function monitorAudioLevel({
	mediaStreamTrack,
	onMeasure,
	intervalMs = 1000 / 60, // default should land us near 60fps
}: {
	mediaStreamTrack: MediaStreamTrack
	onMeasure: (value: number) => void
	intervalMs?: number
}) {
	let timeout = -1
	let interval = -1
	const audioContext = new AudioContext()
	const stream = new MediaStream()
	stream.addTrack(mediaStreamTrack)
	const mediaStreamAudioSourceNode =
		audioContext.createMediaStreamSource(stream)
	const analyserNode = audioContext.createAnalyser()
	mediaStreamAudioSourceNode.connect(analyserNode)
	// Since we just need a rough approximation and will be measuring
	// frequently, we want to drop this down from the default of 2048
	analyserNode.fftSize = 32

	const pcmData = new Float32Array(analyserNode.fftSize)
	let peak = 0

	interval = window.setInterval(() => {
		onMeasure(peak)
		peak = 0
	}, intervalMs)

	const tick = () => {
		timeout = window.setTimeout(() => {
			analyserNode.getFloatTimeDomainData(pcmData)
			let sumSquares = 0.0
			for (const amplitude of pcmData) {
				sumSquares += amplitude * amplitude
			}
			const current = Math.sqrt(sumSquares / pcmData.length)
			if (current > peak) {
				peak = current
			}
			tick()
		})
	}
	tick()

	return () => {
		mediaStreamAudioSourceNode.disconnect()
		analyserNode.disconnect()
		audioContext.close()
		clearInterval(interval)
		clearTimeout(timeout)
		stream.removeTrack(mediaStreamTrack)
	}
}
