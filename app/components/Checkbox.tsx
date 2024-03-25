import * as RadixCheckbox from '@radix-ui/react-checkbox'
import type { FC } from 'react'
import { cn } from '~/utils/style'
import { Icon } from './Icon/Icon'

export const Checkbox: FC<RadixCheckbox.CheckboxProps> = ({
	className,
	...rest
}) => (
	<RadixCheckbox.Root
		className={cn(
			'bg-zinc-100',
			'dark:bg-zinc-700',
			'border',
			'border-zinc-800',
			'w-6',
			'h-6',
			'flex',
			'items-center',
			'justify-center',
			'shadow',
			'hover:bg-orange-200',
			'dark:hover:bg-orange-900',
			'focus:shadow',
			className
		)}
		{...rest}
	>
		<RadixCheckbox.Indicator className="text-orange-700 dark:text-orange-400">
			<Icon type="CheckIcon" />
		</RadixCheckbox.Indicator>
	</RadixCheckbox.Root>
)
