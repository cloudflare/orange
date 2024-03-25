import * as RadixSelect from '@radix-ui/react-select'
import type { ReactNode } from 'react'
import { forwardRef } from 'react'
import { cn } from '~/utils/style'
import { Icon } from './Icon/Icon'
import { Tooltip } from './Tooltip'

export const Select = forwardRef<
	HTMLButtonElement,
	RadixSelect.SelectProps & {
		id?: string
		placeholder?: string
		className?: string
		children: ReactNode
		tooltipContent?: string
	}
>(
	(
		{ id, className, placeholder, children, disabled, tooltipContent, ...rest },
		ref
	) => {
		return (
			<RadixSelect.Root disabled={disabled} {...rest}>
				<Tooltip content={tooltipContent}>
					<RadixSelect.Trigger
						ref={ref}
						id={id}
						className={cn(
							'max-w-full inline-flex items-center justify-center px-8 text-sm leading-none h-8 gap-1 rounded',
							'bg-zinc-100 text-zinc-800',
							'dark:bg-zinc-700 dark:text-zinc-100',
							disabled && 'opacity-70',
							className
						)}
					>
						<span className="whitespace-nowrap overflow-hidden text-ellipsis">
							<RadixSelect.Value placeholder={placeholder}></RadixSelect.Value>
						</span>
						<RadixSelect.Icon className="text-orange-400">
							<Icon type="ChevronDownIcon" />
						</RadixSelect.Icon>
					</RadixSelect.Trigger>
				</Tooltip>
				<RadixSelect.Portal>
					<RadixSelect.Content className="overflow-hidden bg-zinc-50 dark:bg-zinc-700 shadow-xl rounded">
						<RadixSelect.ScrollUpButton className="SelectScrollButton flex items-center justify-center h-6 bg-white text-orange-400 cursor-default">
							<Icon type="ChevronUpIcon" />
						</RadixSelect.ScrollUpButton>
						<RadixSelect.Viewport className="py-4">
							{children}
						</RadixSelect.Viewport>
						<RadixSelect.ScrollDownButton className="SelectScrollButton flex items-center justify-center h-6 bg-white text-orange-400 cursor-default">
							<Icon type="ChevronDownIcon" />
						</RadixSelect.ScrollDownButton>
					</RadixSelect.Content>
				</RadixSelect.Portal>
			</RadixSelect.Root>
		)
	}
)

Select.displayName = 'Select'

export const Option = forwardRef<HTMLDivElement, RadixSelect.SelectItemProps>(
	({ children, className, ...props }, forwardedRef) => (
		<RadixSelect.Item
			className={cn(
				'SelectItem text-sm leading-none text-zinc-800 dark:text-zinc-100 flex items-center min-h-[1.5rem] pl-10 pr-12 relative select-none',
				'data-[disabled]:pointer-events-none',
				'data-[disabled]:text-zinc-500',
				'data-[highlighted]:outline-none',
				'data-[highlighted]:bg-orange-300',
				'dark:data-[highlighted]:bg-orange-500',
				className
			)}
			{...props}
			ref={forwardedRef}
		>
			<RadixSelect.ItemText>{children}</RadixSelect.ItemText>
			<RadixSelect.ItemIndicator className="absolute left-4 w-6 inline-flex items-center justify-center">
				<Icon type="CheckIcon" />
			</RadixSelect.ItemIndicator>
		</RadixSelect.Item>
	)
)

Option.displayName = 'Option'
