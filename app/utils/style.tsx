import clsx, { type ClassValue } from 'clsx'
import { forwardRef, type ComponentType, type ForwardedRef } from 'react'
import { twMerge } from 'tailwind-merge'

/** Merges class names and handles conditional objects */
export function cn(...classes: ClassValue[]): string {
	return twMerge(clsx(...classes))
}

type WithClassName = {
	className?: string
}

export function style<P extends object & WithClassName>(
	Component: ComponentType<P>,
	defaultClassName?: string
) {
	const StyledComponent = forwardRef<unknown, P>(
		(props, ref: ForwardedRef<unknown>) => {
			const { className, ...rest } = props
			return (
				<Component
					ref={ref}
					{...(rest as P)}
					className={twMerge(defaultClassName, className)}
				/>
			)
		}
	)

	StyledComponent.displayName = `Styled(${Component.displayName || Component.name || 'Component'})`
	return StyledComponent
}
