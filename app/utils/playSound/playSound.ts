import invariant from 'tiny-invariant'
import join from './sounds/Join.mp3'
import leave from './sounds/Leave.mp3'
import raiseHand from './sounds/RaiseHand.mp3'

const fetchOnce = async (...args: Parameters<typeof fetch>) => {
	invariant(
		!args.some((a) => a instanceof Request),
		'fetchOnce cannot cache with Request parameters'
	)
	const cache = new Map<string, Response>()
	const key = JSON.stringify(args)
	let result = cache.get(key)
	if (result) {
		return result.clone()
	} else {
		result = await fetch(...args)
		cache.set(key, result)
		return result.clone()
	}
}

const sounds = {
	leave,
	join,
	raiseHand,
}

const volumeMap = {
	join: 0.2,
	leave: 0.2,
	raiseHand: 0.1,
} satisfies Record<keyof typeof sounds, number>

export async function playSound(sound: keyof typeof sounds) {
	const arrayBuffer = await fetchOnce(sounds[sound]).then((res) =>
		res.arrayBuffer()
	)
	const context = new AudioContext()
	const audioBuffer = await context.decodeAudioData(arrayBuffer)
	const source = context.createBufferSource()
	const gainNode = context.createGain()
	source.buffer = audioBuffer
	source.connect(gainNode)
	gainNode.connect(context.destination)
	gainNode.gain.setValueAtTime(volumeMap[sound], context.currentTime)
	source.start()
}
