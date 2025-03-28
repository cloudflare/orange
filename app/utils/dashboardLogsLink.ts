export function dashboardLogsLink(
	baseUrl: string,
	filters: {
		id: string
		type: string
		key: string
		value: string
		operation: 'eq'
	}[]
) {
	const dashboardLogsParams = new URLSearchParams({
		view: 'events',
		needle: JSON.stringify({ value: '', matchCase: false, isRegex: false }),
		filters: JSON.stringify(filters),
	})

	return baseUrl + `/observability/logs?${dashboardLogsParams}`
}
