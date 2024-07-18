import {
	combineLatest,
	interval,
	map,
	Observable,
	pairwise,
	switchMap,
} from 'rxjs'
import Ewma from '~/utils/ewma'

export interface PacketLossStats {
	inboundPacketLossPercentage: number
	outboundPacketLossPercentage: number
}

export function getPacketLossStats$(
	peerConnection$: Observable<RTCPeerConnection>
) {
	const inboundPacketLossPercentageEwma = new Ewma(2000, 0)
	const outboundPacketLossPercentageEwma = new Ewma(2000, 0)
	return combineLatest([peerConnection$, interval(1000)]).pipe(
		switchMap(([peerConnection]) => peerConnection.getStats()),
		pairwise(),
		map(([previousStatsReport, newStatsReport]) => {
			let inboundPacketsReceived = 0
			let inboundPacketsLost = 0
			let outboundPacketsSent = 0
			let outboundPacketsLost = 0

			newStatsReport.forEach((report) => {
				const previous = previousStatsReport.get(report.id)
				if (!previous) return

				if (report.type === 'inbound-rtp') {
					inboundPacketsLost += report.packetsLost - previous.packetsLost
					inboundPacketsReceived +=
						report.packetsReceived - previous.packetsReceived
				} else if (report.type === 'outbound-rtp') {
					const packetsSent = report.packetsSent - previous.packetsSent
					// Find the corresponding remote-inbound-rtp report
					const remoteInboundReport = Array.from(newStatsReport.values()).find(
						(r) => r.type === 'remote-inbound-rtp' && r.ssrc === report.ssrc
					)
					const previousRemoteInboundReport = Array.from(
						previousStatsReport.values()
					).find(
						(r) => r.type === 'remote-inbound-rtp' && r.ssrc === previous.ssrc
					)
					if (
						remoteInboundReport &&
						previousRemoteInboundReport &&
						packetsSent > 0
					) {
						outboundPacketsSent += report.packetsSent - previous.packetsSent
						outboundPacketsLost +=
							remoteInboundReport.packetsLost -
							previousRemoteInboundReport.packetsLost
					}
				}
			})

			if (inboundPacketsReceived > 0) {
				const packetLossPercentage =
					inboundPacketsLost / (inboundPacketsReceived + inboundPacketsLost)
				inboundPacketLossPercentageEwma.insert(
					Math.max(0, packetLossPercentage)
				)
			}

			if (outboundPacketsSent > 0) {
				const packetLossPercentage =
					outboundPacketsLost / (outboundPacketsSent + outboundPacketsLost)
				outboundPacketLossPercentageEwma.insert(
					Math.max(0, packetLossPercentage)
				)
			}

			return {
				outboundPacketLossPercentage: outboundPacketLossPercentageEwma.value(),
				inboundPacketLossPercentage: inboundPacketLossPercentageEwma.value(),
			} satisfies PacketLossStats
		})
	)
}
