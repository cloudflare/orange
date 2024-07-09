import type { ComponentProps, ElementRef } from 'react'
import { useMemo, useRef, useState } from 'react'
import { Observable, map, shareReplay } from 'rxjs'
import { useObservableEffect, useSubscribedState } from '~/hooks/rxjsHooks'
import { useIsServer } from '~/hooks/useIsServer'
import { RxjsPeer } from '~/utils/rxjs/RxjsPeer.client'
import { getUserMediaTrack$ } from '~/utils/rxjs/getUserMediaTrack$'

export default function Component() {
	const isServer = useIsServer()
	if (isServer) return null
	return <Rxjs />
}

function Rxjs() {
	const [localFeedOn, setLocalFeedOn] = useState(true)
	const [remoteFeedOn, setRemoteFeedOn] = useState(false)
	const client = useMemo(
		() =>
			new RxjsPeer({
				apiBase: `https://rtc.live.cloudflare.com/v1/apps`,
				appId: 'APP_ID',
				token: 'APP_TOKEN',
			}),
		[]
	)

	const peerConnectionState = useSubscribedState(
		client.peerConnectionState$,
		'new'
	)

	const sessionId = useSubscribedState(
		useMemo(
			() => client.session$.pipe(map((x) => x.sessionId)),
			[client.session$]
		),
		null
	)

	const localVideoTrack$ = useWebcamTrack$(localFeedOn)
	const localMicTrack$ = useMicTrack$(localFeedOn)
	const remoteVideoTrack$ = useMemo(() => {
		if (!localVideoTrack$ || !remoteFeedOn) return null
		return client.pullTrack(client.pushTrack(localVideoTrack$))
	}, [client, remoteFeedOn, localVideoTrack$])
	const remoteAudioTrack$ = useMemo(() => {
		if (!localMicTrack$ || !remoteFeedOn) return null
		return client.pullTrack(client.pushTrack(localMicTrack$))
	}, [client, remoteFeedOn, localMicTrack$])

	return (
		<div className="p-2 flex flex-col gap-3">
			<div className="flex gap-2">
				<Button onClick={() => setLocalFeedOn(!localFeedOn)}>
					Turn Local {localFeedOn ? 'Off' : 'On'}
				</Button>
				<Button onClick={() => setRemoteFeedOn(!remoteFeedOn)}>
					Turn Remote {remoteFeedOn ? 'Off' : 'On'}
				</Button>
			</div>
			<div className="grid xl:grid-cols-2">
				{localVideoTrack$ && localFeedOn && (
					<Video videoTrack$={localVideoTrack$} />
				)}
				{localMicTrack$ && localFeedOn && (
					<Audio audioTrack$={localMicTrack$} />
				)}
				{remoteVideoTrack$ && remoteFeedOn && (
					<Video videoTrack$={remoteVideoTrack$} />
				)}
				{remoteAudioTrack$ && remoteFeedOn && (
					<Audio audioTrack$={remoteAudioTrack$} />
				)}
			</div>
			<pre>{JSON.stringify({ peerConnectionState, sessionId }, null, 2)}</pre>
		</div>
	)
}

function Button(props: ComponentProps<'button'>) {
	return <button className="border px-1" {...props}></button>
}

function Video(props: { videoTrack$: Observable<MediaStreamTrack | null> }) {
	const ref = useRef<ElementRef<'video'>>(null)
	useObservableEffect(props.videoTrack$, (track) => {
		if (!ref.current) return
		if (track) {
			const mediaStream = new MediaStream()
			mediaStream.addTrack(track)
			ref.current.srcObject = mediaStream
		} else {
			ref.current.srcObject = null
		}
	})

	return (
		<video className="h-full w-full" ref={ref} autoPlay muted playsInline />
	)
}

function Audio(props: { audioTrack$: Observable<MediaStreamTrack | null> }) {
	const ref = useRef<ElementRef<'audio'>>(null)
	useObservableEffect(props.audioTrack$, (track) => {
		if (!ref.current) return
		if (track) {
			const mediaStream = new MediaStream()
			mediaStream.addTrack(track)
			ref.current.srcObject = mediaStream
		} else {
			ref.current.srcObject = null
		}
	})

	return <audio className="h-full w-full" ref={ref} autoPlay playsInline />
}

function useWebcamTrack$(enabled: boolean) {
	return useMemo(() => {
		if (!enabled) return null
		return getUserMediaTrack$('videoinput').pipe(
			shareReplay({
				refCount: true,
				bufferSize: 1,
			})
		)
	}, [enabled])
}

function useMicTrack$(enabled: boolean) {
	return useMemo(() => {
		if (!enabled) return null
		return getUserMediaTrack$('audioinput').pipe(
			shareReplay({
				refCount: true,
				bufferSize: 1,
			})
		)
	}, [enabled])
}
