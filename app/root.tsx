import {
	json,
	redirect,
	type LinksFunction,
	type LoaderFunctionArgs,
	type MetaFunction,
} from '@remix-run/cloudflare'
import {
	Links,
	LiveReload,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useLoaderData,
} from '@remix-run/react'
import { parse } from 'cookie'
import type { FC, ReactNode } from 'react'
import { useRef } from 'react'
import { useFullscreen, useToggle } from 'react-use'

import { QueryClient, QueryClientProvider } from 'react-query'
import tailwind from '~/styles/tailwind.css'
import { elementNotContainedByClickTarget } from './utils/elementNotContainedByClickTarget'
import getUsername from './utils/getUsername.server'
import { cn } from './utils/style'

function addOneDay(date: Date): Date {
	const result = new Date(date)
	result.setTime(result.getTime() + 24 * 60 * 60 * 1000)
	return result
}

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
	const url = new URL(request.url)
	const username = await getUsername(request)
	if (!username && url.pathname !== '/set-username') {
		const redirectUrl = new URL(url)
		redirectUrl.pathname = '/set-username'
		redirectUrl.searchParams.set('return-url', request.url)
		throw redirect(redirectUrl.toString())
	}

	const defaultResponse = json({
		userDirectoryUrl: context.USER_DIRECTORY_URL,
	})

	// we only care about verifying token freshness if request was a user
	// initiated document request.
	// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-Fetch-User
	const secFetchUser = request.headers.get('Sec-Fetch-User')
	if (secFetchUser !== '?1') return defaultResponse
	const cookiesHeader = request.headers.get('Cookie')
	if (!cookiesHeader) return defaultResponse
	const { CF_Authorization } = parse(cookiesHeader)
	if (!CF_Authorization) return defaultResponse

	const [, payload] = CF_Authorization.split('.')
	const data = JSON.parse(atob(payload))
	const expires = new Date(data.exp * 1000)
	const now = new Date()
	if (addOneDay(now) > expires) {
		const headers = new Headers()
			;['CF_Authorization', 'CF_AppSession'].forEach((cookieName) =>
				headers.append(
					'Set-Cookie',
					`${cookieName}=; Expires=${new Date(0).toUTCString()}; Path=/;`
				)
			)

		throw redirect(request.url, { headers })
	}

	return defaultResponse
}

export const meta: MetaFunction = () => [
	{
		title: 'BeKind Meets',
	},
]

export const links: LinksFunction = () => [
	{ rel: 'stylesheet', href: tailwind },
	{
		rel: 'apple-touch-icon',
		sizes: '180x180',
		href: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎥</text></svg>',
	},
	{
		rel: 'icon',
		type: 'image/png',
		sizes: '32x32',
		href: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎥</text></svg>',
	},
	{
		rel: 'icon',
		type: 'image/png',
		sizes: '16x16',
		href: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎥</text></svg>',
	},
	{
		rel: 'manifest',
		href: '/site.webmanifest',
		crossOrigin: 'use-credentials',
	},
	{
		rel: 'mask-icon',
		href: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎥</text></svg>',
		color: '#faa190',
	},
	{
		rel: 'shortcut icon',
		href: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎥</text></svg>',
	},
]

const Document: FC<{ children?: ReactNode }> = ({ children }) => {
	const fullscreenRef = useRef<HTMLBodyElement>(null)
	const [fullscreenEnabled, toggleFullscreen] = useToggle(false)
	useFullscreen(fullscreenRef, fullscreenEnabled, {
		onClose: () => toggleFullscreen(false),
	})
	return (
		// some extensions add data attributes to the html
		// element that React complains about.
		<html className="h-full" lang="en" suppressHydrationWarning>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="apple-mobile-web-app-title" content="BeKind Meets" />
				<meta name="application-name" content="BeKind Meets" />
				<meta name="msapplication-TileColor" content="#ffffff" />
				<meta
					name="theme-color"
					content="#ffffff"
					media="(prefers-color-scheme: light)"
				/>
				<meta
					name="theme-color"
					content="#232325"
					media="(prefers-color-scheme: dark)"
				/>
				<Meta />
				<Links />
			</head>
			<body
				className={cn(
					'h-full',
					'bg-white',
					'text-zinc-800',
					'dark:bg-zinc-800',
					'dark:text-zinc-200'
				)}
				ref={fullscreenRef}
				onDoubleClick={(e) => {
					if (
						e.target instanceof HTMLElement &&
						!elementNotContainedByClickTarget(e.target)
					)
						toggleFullscreen()
				}}
			>
				{children}
				<ScrollRestoration />
				<div className="hidden" suppressHydrationWarning>
					{/* Replaced in entry.server.ts */}
					__CLIENT_ENV__
				</div>
				<Scripts />
				<LiveReload />
			</body>
		</html>
	)
}

export const ErrorBoundary = () => {
	return (
		<Document>
			<div className="grid h-full place-items-center">
				<p>
					It looks like there was an error, but don't worry it has been
					reported. Sorry about that!
				</p>
			</div>
		</Document>
	)
}

const queryClient = new QueryClient()

export default function App() {
	const { userDirectoryUrl } = useLoaderData<typeof loader>()
	return (
		<Document>
			<div id="root" className="h-full bg-inherit isolate">
				<QueryClientProvider client={queryClient}>
					<Outlet
						context={{
							userDirectoryUrl,
						}}
					/>
				</QueryClientProvider>
			</div>
		</Document>
	)
}
