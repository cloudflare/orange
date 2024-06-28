import * as RadixDialog from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { forwardRef } from 'react'
import { cn, style } from '~/utils/style'

export const DialogOverlay = style(
	RadixDialog.DialogOverlay,
	'fixed inset-0 bg-black opacity-40'
)

export const DialogContent = forwardRef<
	HTMLDivElement,
	RadixDialog.DialogContentProps
>((props, ref) => (
	<RadixDialog.DialogContent
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
	>
		{props.children}
		<DialogClose />
	</RadixDialog.DialogContent>
))

DialogContent.displayName = 'DialogContent'

export const DialogTitle = style(
	RadixDialog.Title,
	'text-zinc-800 dark:text-zinc-100 font-bold text-xl'
)

const DialogClose = () => (
	<RadixDialog.Close className="absolute top-0 right-0 m-4 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-full h-8 w-8">
		<VisuallyHidden>Close</VisuallyHidden>
		<span
			className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
			aria-hidden
		>
			×
		</span>
	</RadixDialog.Close>
)

export const Dialog = RadixDialog.Root
export const Trigger = RadixDialog.Trigger
export const Portal = ({
	container: _container,
	...rest
}: React.ComponentProps<typeof RadixDialog.Portal>) => (
	<RadixDialog.Portal
		container={
			typeof document !== 'undefined'
				? document.getElementById('root')
				: undefined
		}
		{...rest}
	/>
)

export const Description = style(
	RadixDialog.Description,
	'text-sm text-zinc-500 dark:text-zinc-400'
)
