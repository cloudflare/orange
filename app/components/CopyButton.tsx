import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import type { FC } from 'react'
import { useState } from 'react'
import { useTimeoutFn } from 'react-use'
import { useRoomUrl } from '~/hooks/useRoomUrl'
import { Button } from './Button'
import { Icon } from './Icon/Icon'
import { Tooltip } from './Tooltip'

interface CopyButtonProps {}

export const CopyButton: FC<CopyButtonProps> = () => {
	const [copied, setCopied] = useState(false)

	const roomUrl = useRoomUrl()

	const [_isReady, _cancel, reset] = useTimeoutFn(() => {
		setCopied(false)
	}, 2000)

	return (
		<Tooltip
			content={copied ? 'Copied!' : 'Copy URL'}
			open={copied ? true : undefined}
		>
			<Button
				displayType="secondary"
				onClick={() => {
					navigator.clipboard.writeText(roomUrl)
					setCopied(true)
					reset()
				}}
			>
				<Icon
					type={copied ? 'ClipboardDocumentCheckIcon' : 'ClipboardDocumentIcon'}
					className="text-xl"
				/>
				<VisuallyHidden>{copied ? 'Copied!' : 'Copy URL'}</VisuallyHidden>
			</Button>
		</Tooltip>
	)
}
