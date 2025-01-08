import type { LinkProps } from '@remix-run/react'
import { Link } from '@remix-run/react'
import { forwardRef } from 'react'
import { cn } from '~/utils/style'

const displayTypeMap = {
	primary: [
		'text-white',
		'bg-orange-500 hover:bg-orange-600 active:bg-orange-700 active:bg-orange-800',
		'border-orange-500 hover:border-orange-600 active:border-orange-700 active:border-orange-800',
	],
	secondary: [
		'text-zinc-900 dark:text-zinc-100',
		'bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 active:bg-zinc-400 dark:active:bg-zinc-700',
		'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600',
	],
	ghost: [
		'text-white hover:text-zinc-900',
		'bg-transparent hover:bg-white',
		'border-transparent hover:border-white',
	],
	danger: [
		'text-white',
		'bg-red-600 hover:bg-red-700 active:bg-red-800',
		'border-red-600 hover:border-red-700 active:border-red-800',
	],
}

export type ButtonProps = Omit<JSX.IntrinsicElements['button'], 'ref'> & {
	displayType?: keyof typeof displayTypeMap
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, displayType = 'primary', disabled, onClick, ...rest }, ref) => (
		<button
			className={cn(
				'border-4',
				'rounded',
				'uppercase',
				'font-bold',
				'tracking-widest',
				'py-[.5em] px-[1em]',
				disabled && 'cursor-not-allowed opacity-60',
				displayTypeMap[displayType].join(' '),
				className
			)}
			aria-disabled={disabled}
			onClick={disabled ? (e) => e.preventDefault() : onClick}
			{...rest}
			ref={ref}
		/>
	)
)

Button.displayName = 'Button'

export const ButtonLink = forwardRef<
	HTMLAnchorElement,
	LinkProps & {
		displayType?: keyof typeof displayTypeMap
	}
>(({ className, displayType = 'primary', ...rest }, ref) => (
	// eslint-disable-next-line jsx-a11y/anchor-has-content
	<Link
		className={cn(
			'inline-block',
			'border-4',
			'rounded',
			'uppercase',
			'font-bold',
			'tracking-widest',
			'py-[.5em] px-[1em]',
			displayTypeMap[displayType].join(' '),
			className
		)}
		{...rest}
		ref={ref}
	/>
))

ButtonLink.displayName = 'Button'
