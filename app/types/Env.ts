export type Env = {
	rooms: DurableObjectNamespace
	CALLS_APP_ID: string
	CALLS_APP_SECRET: string
	CALLS_API_URL?: string
	USER_DIRECTORY_URL?: string
	FEEDBACK_URL?: string
	FEEDBACK_QUEUE?: Queue
	FEEDBACK_STORAGE?: KVNamespace
	TURN_SERVICE_ID?: string
	TURN_SERVICE_TOKEN?: string
	TRACE_LINK?: string
	API_EXTRA_PARAMS?: string
	MAX_WEBCAM_FRAMERATE?: string
	MAX_WEBCAM_BITRATE?: string
	MAX_WEBCAM_QUALITY_LEVEL?: string
	MAX_API_HISTORY?: string
	DB?: D1Database
	OPENAI_API_TOKEN?: string
	OPENAI_MODEL_ENDPOINT?: string
	OPENAI_MODEL_ID?: string
}
