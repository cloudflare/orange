import { forwardRef } from 'react'
import { cn } from '~/utils/style'

export const Input = forwardRef<
	HTMLInputElement,
	JSX.IntrinsicElements['input']
>(({ className, ...rest }, ref) => (
	<input
		className={cn(
			'w-full',
			'rounded',
			'border-2',
			'border-zinc-500',
			'text-zinc-900',
			'dark:text-zinc-50',
			'bg-zinc-50',
			'dark:bg-zinc-700',
			'px-2',
			'py-1',
			className
		)}
		{...rest}
		ref={ref}
	/>
))

Input.displayName = 'Input'
