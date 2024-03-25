export function elementNotContainedByClickTarget(element: HTMLElement) {
	let current: HTMLElement | null = element

	while (current) {
		if (
			[
				'a',
				'button',
				'details',
				'input',
				'select',
				'textarea',
				'area',
				'audio',
				'iframe',
				'img',
				'label',
				'link',
				'object',
				'summary',
				'video',
			].includes(element.tagName?.toLowerCase()) ||
			element.isContentEditable ||
			element.hasAttribute('tabindex')
		) {
			return true
		}

		current = current.parentElement
	}

	return false
}
