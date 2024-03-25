export default function assertNever(
	_value: never,
	message: string = 'Unhandled type: assert never failed'
) {
	throw new Error(message)
}
