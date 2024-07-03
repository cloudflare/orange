import * as Toast from '@radix-ui/react-toast'
import {
	createContext,
	useCallback,
	useContext,
	useState,
	type ReactNode,
} from 'react'
import { style } from '~/utils/style'

import { nanoid } from 'nanoid'

export const Root = style(
	Toast.Root,
	'bg-white rounded dark:bg-zinc-500 shadow p-3 text-zinc-800 dark:text-zinc-50'
)

interface Notification {
	content: ReactNode
	id: string
	duration?: number
}

const NotificationToasts = createContext([
	[] as Notification[],
	(_content: ReactNode, _options?: { duration?: number }) => {},
] as const)

export const NotificationToastsProvider = (props: { children?: ReactNode }) => {
	const [messages, setMessages] = useState<Notification[]>([])

	const dispatch = useCallback(
		(content: ReactNode, options?: { duration?: number }) =>
			setMessages((ms) => [
				...ms,
				{
					...options,
					id: nanoid(14),
					content,
				},
			]),
		[]
	)

	const value = [messages, dispatch] as const

	return (
		<Toast.Provider duration={4000}>
			<NotificationToasts.Provider value={value}>
				{props.children}
				{messages.map(({ content, id, duration }) => (
					<Root
						type="background"
						duration={duration}
						key={id}
						onOpenChange={(open) => {
							if (!open) {
								// remove from messages when closed
								setMessages((ms) => ms.filter((m) => m.id !== id))
							}
						}}
					>
						{content}
					</Root>
				))}
			</NotificationToasts.Provider>
		</Toast.Provider>
	)
}

export const useDispatchToast = () => useContext(NotificationToasts)[1]

export default {
	...Toast,
	Viewport: style(
		Toast.Viewport,
		'absolute bottom-0 right-0 flex flex-col items-end p-7 gap-4 max-w-100vw m-0 outline-none'
	),
	Root,
	Action: style(Toast.Action, 'ml-auto'),
	Provider: NotificationToastsProvider,
}
