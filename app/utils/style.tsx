import { clsx, type ClassValue } from 'clsx'
import type { ComponentType } from 'react'
import { forwardRef } from 'react'
import { twMerge } from 'tailwind-merge'

export const cn = (...classValues: ClassValue[]) =>
	twMerge(clsx(...classValues))

export function style<Props extends { className?: string }, T>(
	Component: ComponentType<Props>,
	...styles: ClassValue[]
) {
	const StyledComponent = forwardRef<T, Props>((props, ref) => (
		<Component
			ref={ref}
			{...props}
			className={cn(...styles, props.className)}
		/>
	))
	StyledComponent.displayName = `styled(${
		Component.displayName ?? Component.name
	})`

	return StyledComponent
}
