import type { RefObject } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { CreateGridOptions } from '..'
import { createGridItemPositioner, getGridItemDimensions } from '..'

/**
 * A React hook to calculate dimensions of an element.
 * @param $el An element ref
 * @returns Dimensions of the element
 */
export function useGridDimensions($el: RefObject<HTMLElement>) {
	const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

	useEffect(() => {
		if (!$el.current) {
			throw new Error('good-grid: Element reference not set.')
		}

		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { clientWidth: width, clientHeight: height } = entry.target
				setDimensions({ width, height })
			}
		})

		observer.observe($el.current!)

		return () => {
			observer.disconnect()
		}
	}, [$el])

	return dimensions
}

/**
 * React hook for using good-grid effortlessly.
 */
export function useGoodGrid({
	dimensions,
	aspectRatio,
	gap,
	count,
}: CreateGridOptions) {
	const { width, height, rows, cols } = useMemo(() => {
		return getGridItemDimensions({ dimensions, count, aspectRatio, gap })
	}, [dimensions, aspectRatio, gap, count])

	const getPosition = createGridItemPositioner({
		parentDimensions: dimensions,
		dimensions: { width, height },
		rows,
		cols,
		gap,
		count,
	})

	return { width, height, getPosition }
}
