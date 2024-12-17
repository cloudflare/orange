import { Observable } from 'rxjs'

export const mutedAudioTrack$ = new Observable<MediaStreamTrack>(
	(subscriber) => {
		const audioContext = new window.AudioContext()
		const destination = audioContext.createMediaStreamDestination()
		const track = destination.stream.getAudioTracks()[0]
		subscriber.next(track)
		return () => {
			track.stop()
			audioContext.close()
		}
	}
)
