export interface GridDimensions {
	width: number
	height: number
}

/**
 * Parses the Aspect Ratio string to actual ratio
 * @param ratio The aspect ratio in the format of `16:9` where `width:height`
 * @returns The parsed value of aspect ratio
 */
export function getAspectRatio(ratio: string) {
	const [width, height] = ratio.split(':')
	if (!width || !height) {
		throw new Error(
			'good-grid: Invalid aspect ratio provided, expected format is "width:height".'
		)
	}
	return Number.parseInt(height) / Number.parseInt(width)
}

/**
 * Calculates grid item dimensions for items that can fit in a container.
 */
export function getGridItemDimensions({
	count,
	dimensions,
	aspectRatio,
	gap,
}: CreateGridOptions) {
	/**
	 * The code in this function is adapted from the following answer
	 * to a question, although a bit modified
	 * https://stackoverflow.com/a/28268965
	 */

	let { width: W, height: H } = dimensions

	if (W === 0 || H === 0) {
		return { width: 0, height: 0, rows: 1, cols: 1 }
	}

	W -= gap * 2
	H -= gap * 2

	const s = gap,
		N = count
	const r = getAspectRatio(aspectRatio)

	let w = 0,
		h = 0
	let a = 1,
		b = 1

	const widths = []

	for (let n = 1; n <= N; n++) {
		widths.push((W - s * (n - 1)) / n, (H - s * (n - 1)) / (n * r))
	}

	// sort in descending order, largest first
	widths.sort((a, b) => b - a)

	for (const width of widths) {
		w = width
		h = w * r

		a = Math.floor((W + s) / (w + s))
		b = Math.floor((H + s) / (h + s))

		if (a * b >= N) {
			// recalculate rows and cols, as row and col calculated above can be inaccurate
			a = Math.ceil(N / b)
			b = Math.ceil(N / a)
			break
		}
	}

	return { width: w, height: h, rows: b, cols: a }
}

interface CreateGridItemPositionOptions {
	parentDimensions: GridDimensions
	dimensions: GridDimensions
	rows: number
	cols: number
	count: number
	gap: number
}

/**
 * Creates a utility function which helps you position grid items in a container.
 */
export function createGridItemPositioner({
	parentDimensions,
	dimensions,
	rows,
	cols,
	count,
	gap,
}: CreateGridItemPositionOptions) {
	const { width: W, height: H } = parentDimensions
	const { width: w, height: h } = dimensions

	const firstTop = (H - (h * rows + (rows - 1) * gap)) / 2
	let firstLeft = (W - (w * cols + (cols - 1) * gap)) / 2

	const topAdd = h + gap
	const leftAdd = w + gap

	let col = 0,
		row = 0

	const incompleteRowCols = count % cols

	function getPosition(index: number) {
		const remaining = count - index

		if (remaining === incompleteRowCols) {
			// in last row with incomplete columns, recalculate firstLeft to make it centered
			firstLeft = (W - (w * remaining + (remaining - 1) * gap)) / 2
		}

		const top = firstTop + row * topAdd
		const left = firstLeft + col * leftAdd

		col++

		if ((index + 1) % cols === 0) {
			// if a row has been traversed completely, increment row, reset col
			row++
			col = 0
		}

		return { top, left }
	}

	return getPosition
}

export interface CreateGridOptions {
	aspectRatio: string
	count: number
	dimensions: GridDimensions
	gap: number
}

/**
 * Calculates data required for making a responsive grid.
 */
export function createGrid({
	aspectRatio,
	count,
	dimensions,
	gap,
}: CreateGridOptions) {
	const { width, height, rows, cols } = getGridItemDimensions({
		aspectRatio,
		count,
		dimensions,
		gap,
	})

	const getPosition = createGridItemPositioner({
		parentDimensions: dimensions,
		dimensions: { width, height },
		rows,
		cols,
		count,
		gap,
	})

	return {
		width,
		height,
		rows,
		cols,
		getPosition,
	}
}
