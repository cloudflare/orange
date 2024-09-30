import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import {
	type ComponentProps,
	type ElementRef,
	forwardRef,
	type ReactNode,
	useState,
} from 'react'
import { useTimeoutFn } from 'react-use'
import { Button } from './Button'
import { Icon } from './Icon/Icon'

interface CopyButtonProps extends ComponentProps<'button'> {
	contentValue: string
	copiedMessage?: ReactNode
}

export const CopyButton = forwardRef<ElementRef<'button'>, CopyButtonProps>(
	(
		{
			children = <VisuallyHidden>Copy</VisuallyHidden>,
			copiedMessage = <VisuallyHidden>Copied!</VisuallyHidden>,
			contentValue,
			onClick,
			...rest
		},
		ref
	) => {
		const [copied, setCopied] = useState(false)

		const [_isReady, _cancel, reset] = useTimeoutFn(() => {
			setCopied(false)
		}, 2000)

		return (
			<Button
				displayType="secondary"
				onClick={(e) => {
					onClick && onClick(e)
					navigator.clipboard.writeText(contentValue)
					setCopied(true)
					reset()
				}}
				ref={ref}
				className="flex items-center gap-2 text-xs"
				{...rest}
			>
				<Icon
					type={copied ? 'ClipboardDocumentCheckIcon' : 'ClipboardDocumentIcon'}
					className="text-xl"
				/>
				{copied ? copiedMessage : children}
			</Button>
		)
	}
)

CopyButton.displayName = 'CopyButton'
