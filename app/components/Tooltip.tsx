import * as RadixTooltip from '@radix-ui/react-tooltip'
import type { FC, ReactNode } from 'react'

interface TooltipProps {
	open?: boolean
	content?: ReactNode
	children: ReactNode
}

export const Tooltip: FC<TooltipProps> = ({ children, content, open }) => {
	if (content === undefined) return <>{children}</>

	return (
		<RadixTooltip.Provider>
			<RadixTooltip.Root open={open}>
				<RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
				<RadixTooltip.Portal>
					<RadixTooltip.Content className="bg-zinc-100 dark:bg-zinc-600 text-sm px-2 py-1 drop-shadow-md dark:drop-shadow-none rounded">
						{content}
						<RadixTooltip.Arrow className="fill-zinc-100 dark:fill-zinc-600 drop-shadow dark:drop-shadow-none rounded" />
					</RadixTooltip.Content>
				</RadixTooltip.Portal>
			</RadixTooltip.Root>
		</RadixTooltip.Provider>
	)
}
