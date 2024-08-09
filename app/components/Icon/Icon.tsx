import {
	ArrowDownOnSquareIcon,
	ArrowUpOnSquareIcon,
	ArrowsPointingInIcon,
	ArrowsPointingOutIcon,
	BugAntIcon,
	CheckIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	ClipboardDocumentCheckIcon,
	ClipboardDocumentIcon,
	Cog6ToothIcon,
	ComputerDesktopIcon,
	EllipsisVerticalIcon,
	ExclamationCircleIcon,
	HandRaisedIcon,
	MicrophoneIcon,
	MinusIcon,
	PhoneXMarkIcon,
	PlusIcon,
	ServerStackIcon,
	SignalSlashIcon,
	UserGroupIcon,
	VideoCameraIcon,
	VideoCameraSlashIcon,
	WifiIcon,
	XCircleIcon,
} from '@heroicons/react/20/solid'
import type { ComponentProps, FC } from 'react'
import { cn } from '~/utils/style'
import { MicrophoneSlashIcon } from './custom/MicrophoneSlashIcon'

const iconMap = {
	micOn: MicrophoneIcon,
	micOff: MicrophoneSlashIcon,
	videoOn: VideoCameraIcon,
	videoOff: VideoCameraSlashIcon,
	screenshare: ComputerDesktopIcon,
	arrowsOut: ArrowsPointingOutIcon,
	arrowsIn: ArrowsPointingInIcon,
	cog: Cog6ToothIcon,
	xCircle: XCircleIcon,
	bug: BugAntIcon,
	phoneXMark: PhoneXMarkIcon,
	handRaised: HandRaisedIcon,
	userGroup: UserGroupIcon,
	PlusIcon,
	MinusIcon,
	CheckIcon,
	ChevronUpIcon,
	ChevronDownIcon,
	EllipsisVerticalIcon,
	ClipboardDocumentCheckIcon,
	ClipboardDocumentIcon,
	SignalSlashIcon,
	ExclamationCircleIcon,
	ServerStackIcon,
	ArrowDownOnSquareIcon,
	ArrowUpOnSquareIcon,
	WifiIcon,
}

interface IconProps {
	type: keyof typeof iconMap
}

export const Icon: FC<IconProps & ComponentProps<'svg'>> = ({
	type,
	className,
	...rest
}) => {
	const Component = iconMap[type]
	return <Component className={cn('h-[1em]', className)} {...rest} />
}
