import type { Env } from './types/Env'
import type { ChatCard } from './types/GoogleChatApi'

export const queue = async (batch: MessageBatch<ChatCard>, env: Env) => {
	for (const message of batch.messages) {
		if (env.FEEDBACK_URL) {
			try {
				await fetch(env.FEEDBACK_URL, {
					method: 'post',
					body: JSON.stringify(message.body),
				})
			} catch (error) {
				message.retry()
			}
		} else {
			console.log('would have posted to feedback URL', message)
		}
	}
}
