export type Env = {
	USER_DIRECTORY_URL?: string
	FEEDBACK_URL?: string
	FEEDBACK_QUEUE?: Queue
	CALLS_APP_ID: string
	CALLS_APP_SECRET: string
	TRACE_LINK?: string
	API_EXTRA_PARAMS?: string
	limiters: DurableObjectNamespace
	rooms: DurableObjectNamespace
}
