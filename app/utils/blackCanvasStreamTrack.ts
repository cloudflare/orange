import invariant from 'tiny-invariant'

export function blackCanvasStreamTrack(videoTrack?: MediaStreamTrack) {
	const canvas = document.createElement('canvas')
	canvas.height = videoTrack?.getSettings().height ?? 720
	canvas.width = videoTrack?.getSettings().width ?? 1280
	const ctx = canvas.getContext('2d')
	invariant(ctx)
	ctx.fillStyle = 'black'
	ctx.fillRect(0, 0, canvas.width, canvas.height)
	// we need to draw to the canvas in order for video
	// frames to be sent on the video track
	setInterval(() => {
		ctx.fillStyle = 'black'
		ctx.fillRect(0, 0, canvas.width, canvas.height)
	}, 1000)
	return canvas.captureStream().getVideoTracks()[0]
}
