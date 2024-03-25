export function assertError(value: unknown): asserts value is Error {
	if (value instanceof Error) return
	throw value
}
