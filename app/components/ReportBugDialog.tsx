import { useFetcher, useParams } from '@remix-run/react'
import type { FC } from 'react'
import useCopyToClipboard from '~/hooks/useCopyToClipboard'
import { useRoomContext } from '~/hooks/useRoomContext'
import type { BugReportInfo } from '~/routes/api.bugReport'
import { Button } from './Button'
import {
	Description,
	Dialog,
	DialogContent,
	DialogOverlay,
	DialogTitle,
	Portal,
} from './Dialog'
import { Label } from './Label'
import { TextArea } from './TextArea'

interface ReportBugDialogProps {
	onOpenChange?: (open: boolean) => void
}

export const ReportBugDialog: FC<ReportBugDialogProps> = ({ onOpenChange }) => {
	return (
		<Dialog open onOpenChange={onOpenChange}>
			<Portal>
				<DialogOverlay />
				<DialogContent>
					<ReportBugForm />
				</DialogContent>
			</Portal>
		</Dialog>
	)
}

const ReportBugForm: FC = () => {
	const { Form, data, state } = useFetcher()
	const { room, peerDebugInfo } = useRoomContext()
	const { roomName } = useParams()

	const { roomState, identity } = room

	const info: BugReportInfo = {
		roomState,
		roomName,
		identity,
		peerDebugInfo,
		url: typeof location !== 'undefined' ? location.href : undefined,
	}

	const [copied, copy] = useCopyToClipboard()

	const infoString = JSON.stringify(info, null, 2)

	return data ? (
		<div className="space-y-4">
			<DialogTitle>Thank you!</DialogTitle>
			<Description>Your report has been submitted!</Description>
		</div>
	) : (
		<div className="space-y-4">
			<DialogTitle>Report a bug</DialogTitle>
			<Description>
				The Calls team will be notified with tracing details.
			</Description>
			<details className="cursor-pointer">
				<summary className="text-sm text-zinc-500 dark:text-zinc-400">
					Debug Info (included automatically)
				</summary>
				<div className="space-y-4">
					{/* Empty div so the button gets padding top from stack */}
					<div></div>
					<Button
						className="text-sm"
						onClick={() => {
							copy(infoString)
						}}
					>
						{copied ? 'Copied!' : 'Copy'}
					</Button>
					<TextArea rows={10} readOnly defaultValue={infoString}></TextArea>
				</div>
			</details>

			<Form method="post" action="/api/bugReport">
				<div className="space-y-4">
					<Label className="font-bold">Description</Label>
					<TextArea name="description" rows={8}></TextArea>
				</div>
				<input name="info" type="hidden" value={JSON.stringify(info)} />
				<Button
					className="mt-4 text-sm"
					type="submit"
					disabled={state === 'submitting'}
				>
					{state === 'submitting' ? 'Submitting...' : 'Submit'}
				</Button>
			</Form>
		</div>
	)
}
