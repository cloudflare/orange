export type LogEvent =
	| {
			eventName: 'onStart'
			meetingId?: string
	  }
	| {
			eventName: 'alarm'
			meetingId?: string
	  }
	| {
			eventName: 'onConnect'
			meetingId?: string
			foundInStorage: boolean
			connectionId: string
	  }
	| {
			eventName: 'onClose'
			meetingId?: string
			connectionId: string
			code: number
			reason: string
			wasClean: boolean
	  }
	| {
			eventName: 'userLeft'
			meetingId?: string
			connectionId: string
	  }
	| {
			eventName: 'cleaningUpConnections'
			meetingId?: string
			connectionsFound: number
			websocketsFound: number
			websocketStatuses: number[]
	  }
	| {
			eventName: 'userTimedOut'
			meetingId?: string
			connectionId: string
	  }
	| {
			eventName: 'startingMeeting'
			meetingId?: string
	  }
	| {
			eventName: 'endingMeeting'
			meetingId?: string
	  }
	| {
			eventName: 'meetingIdNotFoundInCleanup'
	  }
	| {
			eventName: 'errorBroadcastingToUser'
			meetingId?: string
			connectionId: string
	  }
	| {
			eventName: 'onErrorHandler'
			error: unknown
	  }
	| {
			eventName: 'onErrorHandlerDetails'
			meetingId?: string
			connectionId: string
			error: unknown
	  }
	| {
			eventName: 'errorHandlingMessage'
			meetingId?: string
			connectionId: string
			error: unknown
	  }

export function log(event: LogEvent) {
	console.log(event)
}
