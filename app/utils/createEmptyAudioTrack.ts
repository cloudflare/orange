export function createEmptyAudioTrack() {
	const audioContext = new AudioContext()
	const oscillator = audioContext.createOscillator()
	const gainNode = audioContext.createGain()
	gainNode.gain.setValueAtTime(0, audioContext.currentTime)
	oscillator.connect(gainNode)
	const destination = audioContext.createMediaStreamDestination()
	gainNode.connect(destination)
	oscillator.start()
	return destination.stream.getAudioTracks()[0]
}
