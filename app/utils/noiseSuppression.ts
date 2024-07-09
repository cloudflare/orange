// adopted from https://github.com/jitsi/jitsi-meet/tree/master/react/features/stream-effects/noise-suppression

import invariant from 'tiny-invariant'

export default function noiseSuppression(
	originalAudioStreamTrack: MediaStreamTrack
): MediaStreamTrack {
	const mediaStream = new MediaStream()
	mediaStream.addTrack(originalAudioStreamTrack)

	const suppressor = new NoiseSuppressionEffect()
	const output = suppressor.startEffect(mediaStream)

	const noiseSuppressedTrack = output.getAudioTracks()[0]
	noiseSuppressedTrack.stop = () => {
		suppressor.stopEffect()
		MediaStreamTrack.prototype.stop.call(originalAudioStreamTrack)
	}
	noiseSuppressedTrack.getSettings = () =>
		originalAudioStreamTrack.getSettings()
	return noiseSuppressedTrack
}

/**
 * Effect applies rnnoise denoising on a audio MediaStreamTrack.
 */
class NoiseSuppressionEffect {
	/**
	 * Web audio context.
	 */
	private _audioContext?: AudioContext

	/**
	 * Source that will be attached to the track affected by the effect.
	 */
	private _audioSource?: MediaStreamAudioSourceNode

	/**
	 * Destination that will contain denoised audio from the audio worklet.
	 */
	private _audioDestination?: MediaStreamAudioDestinationNode

	/**
	 * `AudioWorkletProcessor` associated node.
	 */
	private _noiseSuppressorNode?: AudioWorkletNode

	/**
	 * Audio track extracted from the original MediaStream to which the effect is applied.
	 */
	private _originalMediaTrack?: MediaStreamTrack

	/**
	 * Noise suppressed audio track extracted from the media destination node.
	 */
	private _outputMediaTrack?: MediaStreamTrack

	/**
	 * Applies effect that uses a {@code NoiseSuppressor} service initialized with {@code RnnoiseProcessor}
	 * for denoising.
	 *
	 * @param {MediaStream} audioStream - Audio stream which will be mixed with _mixAudio.
	 * @returns {MediaStream} - MediaStream containing both audio tracks mixed together.
	 */
	startEffect(audioStream: MediaStream): MediaStream {
		this._audioContext = new AudioContext()
		this._originalMediaTrack = audioStream.getAudioTracks()[0]
		this._audioSource = this._audioContext.createMediaStreamSource(audioStream)
		this._audioDestination = this._audioContext.createMediaStreamDestination()
		this._outputMediaTrack = this._audioDestination.stream.getAudioTracks()[0]

		const workletUrl = `/noise/noise-suppressor-worklet.esm.js`

		// Connect the audio processing graph MediaStream -> AudioWorkletNode -> MediaStreamAudioDestinationNode
		this._audioContext.audioWorklet
			.addModule(workletUrl)
			.then(() => {
				invariant(this._audioContext)
				// After the resolution of module loading, an AudioWorkletNode can be constructed.
				this._noiseSuppressorNode = new AudioWorkletNode(
					this._audioContext,
					'NoiseSuppressorWorklet'
				)
				invariant(this._audioSource)
				invariant(this._audioDestination)
				this._audioSource
					.connect(this._noiseSuppressorNode)
					.connect(this._audioDestination)
			})
			.catch((error) => {
				console.error(error)
			})

		// Sync the effect track muted state with the original track state.
		this._outputMediaTrack.enabled = this._originalMediaTrack.enabled

		// We enable the audio on the original track because mute/unmute action will only affect the audio destination
		// output track from this point on.
		this._originalMediaTrack.enabled = true

		return this._audioDestination.stream
	}

	/**
	 * Clean up resources acquired by noise suppressor and rnnoise processor.
	 *
	 * @returns {void}
	 */
	stopEffect(): void {
		// Sync original track muted state with effect state before removing the effect.
		invariant(this._originalMediaTrack)
		invariant(this._outputMediaTrack)
		this._originalMediaTrack.enabled = this._outputMediaTrack.enabled

		// Technically after this process the Audio Worklet along with it's resources should be garbage collected,
		// however on chrome there seems to be a problem as described here:
		// https://bugs.chromium.org/p/chromium/issues/detail?id=1298955
		this._noiseSuppressorNode?.port?.close()
		this._audioDestination?.disconnect()
		this._noiseSuppressorNode?.disconnect()
		this._audioSource?.disconnect()
		this._audioContext?.close()
	}
}
