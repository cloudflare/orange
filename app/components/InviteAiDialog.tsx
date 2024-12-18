import { useSearchParams } from '@remix-run/react'
import { useState, type ReactNode } from 'react'
import { useRoomContext } from '~/hooks/useRoomContext'
import type { ClientMessage } from '~/types/Messages'
import { Button } from './Button'
import { Dialog, DialogContent, DialogOverlay, Portal } from './Dialog'

const aiVoices = [
	'Alloy',
	'Ash',
	'Ballad',
	'Coral',
	'Echo',
	'Sage',
	'Shimmer',
	'Verse',
]

export function InviteAiDialog(props: { children?: ReactNode }) {
	const [open, setOpen] = useState(false)

	const {
		room: { websocket },
	} = useRoomContext()

	const [params] = useSearchParams()

	const instructions = params.get('instructions')
	const voice = params.get('voice')

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{props.children}
			<Portal>
				<DialogOverlay />
				<DialogContent>
					<form
						className="flex flex-col gap-4 mt-8"
						onSubmit={(e) => {
							e.preventDefault()
							websocket.send(
								JSON.stringify({
									type: 'enableAi',
									...Object.fromEntries(new FormData(e.currentTarget)),
								} satisfies ClientMessage)
							)
							setOpen(false)
						}}
					>
						<div className="flex flex-col gap-2">
							<div>
								<label className="font-medium" htmlFor="instructions">
									Instructions
								</label>
							</div>

							<div>
								<textarea
									className="bg-gray-100 dark:bg-zinc-800 w-full"
									id="instructions"
									name="instructions"
									rows={15}
									defaultValue={
										instructions ??
										`You are a helpful and concise AI assistant for a video chat application called Orange Meets.`
									}
								/>
							</div>
						</div>
						<div className="flex flex-col gap-2">
							<div>
								<label className="font-medium" htmlFor="voice">
									Voice
								</label>
							</div>

							<div>
								<select
									className="bg-gray-100 dark:bg-zinc-800 w-full"
									id="voice"
									name="voice"
									defaultValue={voice ?? 'ash'}
								>
									{aiVoices.map((voice) => (
										<option key={voice} value={voice.toLowerCase()}>
											{voice}
										</option>
									))}
								</select>
							</div>
						</div>

						<Button type="submit" className="self-end text-xs">
							Invite AI
						</Button>
					</form>
				</DialogContent>
			</Portal>
		</Dialog>
	)
}
