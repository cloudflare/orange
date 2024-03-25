export default function isNonNullable<T>(
	value: T | null | undefined
): value is NonNullable<T> {
	return value !== null && value !== undefined
}
