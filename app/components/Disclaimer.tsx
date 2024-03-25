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
			<a
				className="underline"
				href="https://blog.cloudflare.com/announcing-cloudflare-calls/"
			>
				Cloudflare Calls
			</a>
			. If you experience issues, please report them in the app. To build your
			own WebRTC application using Cloudflare Calls,{' '}
			<a
				className="underline"
				href="https://dash.cloudflare.com/?to=/:account/calls"
			>
				get started in the Cloudflare Dashboard
			</a>
			.
		</p>
	)
}
