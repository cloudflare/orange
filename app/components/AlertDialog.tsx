import * as AlertDialog from '@radix-ui/react-alert-dialog'
import type { FC, ReactNode } from 'react'
import { forwardRef } from 'react'
import { cn } from '~/utils/style'

export const Overlay = forwardRef<
	HTMLDivElement,
	AlertDialog.AlertDialogOverlayProps
>(({ className, ...rest }, ref) => (
	<AlertDialog.Overlay
		ref={ref}
		className={cn('fixed inset-0 bg-black opacity-40', className)}
		{...rest}
	/>
))

Overlay.displayName = 'Overlay'

export const Content = forwardRef<
	HTMLDivElement,
	AlertDialog.AlertDialogContentProps
>(({ className: _className, children, ...rest }, ref) => (
	<AlertDialog.Content
		ref={ref}
		className={cn(
			'fixed',
			'rounded-lg',
			'top-1/2',
			'left-1/2',
			'-translate-x-1/2',
			'-translate-y-1/2',
			'min-w-[min(400px,95vw)]',
			'max-w-[95vw]',
			'max-h-[85vh]',
			'overflow-y-auto',
			'p-6',
			'bg-inherit',
			'shadow-xl',
			'dark:shadow-none'
		)}
		{...rest}
	>
		{children}
	</AlertDialog.Content>
))

Content.displayName = 'Content'

const Title = forwardRef<HTMLHeadingElement, AlertDialog.AlertDialogTitleProps>(
	({ className, ...rest }, ref) => (
		<AlertDialog.Title
			ref={ref}
			className={cn(
				'text-zinc-800 dark:text-zinc-200 m-0 text-base font-medium',
				className
			)}
			{...rest}
		/>
	)
)

Title.displayName = 'Title'

const Description = forwardRef<
	HTMLParagraphElement,
	AlertDialog.AlertDialogDescriptionProps
>(({ className, ...rest }, ref) => (
	<AlertDialog.Description
		ref={ref}
		className={cn(
			'text-zinc-500 dark:text-zinc-400 mt-4 mb-5 text-sm leading-normal',
			className
		)}
		{...rest}
	/>
))

Description.displayName = 'Description'

const Actions: FC<{ children: ReactNode; className?: string }> = ({
	children,
	className,
}) => {
	return (
		<div className={cn('flex justify-end gap-4', className)}>{children}</div>
	)
}

export default { ...AlertDialog, Overlay, Content, Title, Description, Actions }
