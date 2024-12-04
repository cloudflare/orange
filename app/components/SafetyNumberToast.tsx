import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import Toast from '~/components/Toast'
import { Icon } from './Icon/Icon'

export function SafetyNumberToast(props: { safetyNumber: string }) {
	return (
		<div className="flex items-center justify-center gap-2 text-sm">
			<Toast.Title className="flex items-center gap-1 ">
				<Icon type="LockClosedIcon" /> Safety Number:{' '}
				<span className="tabular-nums tracking-wider font-semibold">
					{props.safetyNumber}
				</span>
			</Toast.Title>
			<Toast.Close className="flex items-center justify-center w-5 h-5 px-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-600">
				<span aria-hidden>×</span>
				<VisuallyHidden>Dismiss</VisuallyHidden>
			</Toast.Close>
		</div>
	)
}
