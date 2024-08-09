import { useOutletContext } from '@remix-run/react'
import { useQuery } from 'react-query'

interface UserMetadata {
	displayName: string
	firstName?: string
	lastName?: string
	timeZone?: string
	photob64?: string
}

export function useUserMetadata(email: string) {
	const { userDirectoryUrl } = useOutletContext<{ userDirectoryUrl?: string }>()
	const search = new URLSearchParams({ email })

	const key = `${userDirectoryUrl}?${search.toString()}`

	const initialData: UserMetadata = {
		displayName: email,
	}

	return useQuery({
		initialData,
		queryKey: [key],
		queryFn: async ({ queryKey: [key] }) => {
			if (userDirectoryUrl === undefined) return Promise.resolve(initialData)
			const response = await fetch(key, { credentials: 'include' })

			if (
				response.headers.get('Content-Type')?.startsWith('application/json')
			) {
				const parsedData = await response.json<UserMetadata>()
				return {
					...parsedData,
					displayName: `${parsedData.firstName} ${parsedData.lastName}`,
				}
			}
			return initialData
		},
	})
}
