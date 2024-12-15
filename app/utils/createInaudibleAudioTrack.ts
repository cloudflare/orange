export function createInaudibleAudioTrack() {
	const audioContext = new window.AudioContext()

	const oscillator = audioContext.createOscillator()
	oscillator.type = 'sine'
	oscillator.frequency.setValueAtTime(20000, audioContext.currentTime)

	const gainNode = audioContext.createGain()
	gainNode.gain.setValueAtTime(0.001, audioContext.currentTime)

	oscillator.connect(gainNode)

	const destination = audioContext.createMediaStreamDestination()
	gainNode.connect(destination)

	oscillator.start()

	const audioTrack = destination.stream.getAudioTracks()[0]

	return audioTrack
}

export function createMutedTrack() {
	const audioContext = new window.AudioContext()
	const destination = audioContext.createMediaStreamDestination()
	const audioTrack = destination.stream.getAudioTracks()[0]
	return audioTrack
}
