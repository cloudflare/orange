import { Observable } from 'rxjs'

export const inaudibleAudioTrack$ = new Observable<MediaStreamTrack>(
	(subscriber) => {
		const audioContext = new window.AudioContext()

		const oscillator = audioContext.createOscillator()
		oscillator.type = 'triangle'
		oscillator.frequency.setValueAtTime(20, audioContext.currentTime)

		const gainNode = audioContext.createGain()
		gainNode.gain.setValueAtTime(0.02, audioContext.currentTime)

		oscillator.connect(gainNode)

		const destination = audioContext.createMediaStreamDestination()
		gainNode.connect(destination)

		oscillator.start()

		const track = destination.stream.getAudioTracks()[0]

		subscriber.next(track)
		return () => {
			track.stop()
			audioContext.close()
		}
	}
)
