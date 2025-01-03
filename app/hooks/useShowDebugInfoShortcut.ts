import { useEffect } from 'react'
import { useRoomContext } from './useRoomContext'

export function useShowDebugInfoShortcut() {
	const { showDebugInfo, setShowDebugInfo } = useRoomContext()

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() === 'd' && e.ctrlKey) {
				e.preventDefault()
				setShowDebugInfo(!showDebugInfo)
			}
		}
		document.addEventListener('keypress', handler)

		return () => {
			document.removeEventListener('keypress', handler)
		}
	}, [setShowDebugInfo, showDebugInfo])
}
