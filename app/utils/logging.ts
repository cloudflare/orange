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
			eventName: 'userLeft'
			meetingId?: string
			connectionId: string
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
