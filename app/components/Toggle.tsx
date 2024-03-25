import * as RadixSwitch from '@radix-ui/react-switch'
import type { FC } from 'react'
import { cn } from '~/utils/style'

export const Toggle: FC<RadixSwitch.SwitchProps> = ({ className, ...rest }) => (
	<RadixSwitch.Root
		className={cn(
			'w-11',
			'h-6',
			'bg-zinc-600',
			'rounded-full',
			'relative',
			'data-[state=checked]:bg-orange-400',
			className
		)}
		{...rest}
	>
		<RadixSwitch.Thumb
			className={cn(
				'block',
				'w-5',
				'h-5',
				'bg-white',
				'rounded-full',
				'shadow-zinc-900/70',
				'transition-transform',
				'translate-x-[2px]',
				'data-[state=checked]:translate-x-[22px]'
			)}
		/>
	</RadixSwitch.Root>
)
