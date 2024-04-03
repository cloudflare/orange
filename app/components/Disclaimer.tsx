import type { FC } from 'react'
import { cn } from '~/utils/style'

interface DisclaimerProps {
	className?: string
}

export const Disclaimer: FC<DisclaimerProps> = ({ className }) => {
	return (
		<p
			className={cn(
				'text-xs text-zinc-400 dark:text-zinc-500 max-w-prose',
				className
			)}
		>
			Orange Meets is a demo application built using{' '}
			<a className="underline" href="https://developers.cloudflare.com/calls/">
				Cloudflare Calls
			</a>
			. To build your own WebRTC application using Cloudflare Calls, get started
			in the{' '}
			<a
				className="underline"
				href="https://dash.cloudflare.com/?to=/:account/calls"
			>
				Cloudflare Dashboard
			</a>
			.
		</p>
	)
}
