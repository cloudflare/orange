// @ts-ignore
import {
	getAssetFromKV,
	MethodNotAllowedError,
	NotFoundError,
} from '@cloudflare/kv-asset-handler'
import type { AppLoadContext, ServerBuild } from '@remix-run/cloudflare'
import { createRequestHandler } from '@remix-run/cloudflare'
import * as build from '@remix-run/dev/server-build'
// @ts-expect-error
import manifestJSON from '__STATIC_CONTENT_MANIFEST'
import { mode } from '~/utils/mode'
import { queue } from './app/queue'

const baseRemixHandler = createRequestHandler(build, mode)

export const remixHandler = (request: Request, env: AppLoadContext) => {
	return baseRemixHandler(request, { ...env, mode })
}

const notImplemented = () => {
	throw new Error('Not implemented')
}

export const createKvAssetHandler = (ASSET_MANIFEST: Record<string, string>) =>
	async function handleAsset(
		request: Request,
		env: any,
		ctx: any,
		build: ServerBuild
	) {
		const ASSET_NAMESPACE = env.__STATIC_CONTENT

		// Apparently it's fine to fake this event to use with modules format
		// https://github.com/cloudflare/kv-asset-handler#es-modules
		const event = Object.assign(new Event('fetch'), {
			request,
			waitUntil(promise: Promise<unknown>) {
				return ctx.waitUntil(promise)
			},
			// These shouldn't be used
			respondWith: notImplemented,
			passThroughOnException: notImplemented,
		})

		try {
			if (mode === 'development') {
				return await getAssetFromKV(event, {
					cacheControl: {
						bypassCache: true,
					},
					ASSET_MANIFEST,
					ASSET_NAMESPACE,
				})
			}

			let cacheControl = {}
			let url = new URL(event.request.url)
			let assetpath = build.assets.url.split('/').slice(0, -1).join('/')
			let requestpath = url.pathname.split('/').slice(0, -1).join('/')

			if (requestpath.startsWith(assetpath)) {
				// Assets are hashed by Remix so are safe to cache in the browser
				// And they're also hashed in KV storage, so are safe to cache on the edge
				cacheControl = {
					bypassCache: false,
					edgeTTL: 31536000,
					browserTTL: 31536000,
				}
			} else {
				// Assets are not necessarily hashed in the request URL, so we cannot cache in the browser
				// But they are hashed in KV storage, so we can cache on the edge
				cacheControl = {
					bypassCache: false,
					edgeTTL: 31536000,
				}
			}

			return await getAssetFromKV(event, {
				cacheControl,
				ASSET_MANIFEST,
				ASSET_NAMESPACE,
			})
		} catch (error) {
			if (
				error instanceof MethodNotAllowedError ||
				error instanceof NotFoundError
			) {
				return null
			}

			throw error
		}
	}

export { ChatRoom } from './app/durableObjects/ChatRoom.server'
export { queue } from './app/queue'

const kvAssetHandler = createKvAssetHandler(JSON.parse(manifestJSON))

export default {
	async fetch(request: Request, env: any, ctx: any) {
		const assetResponse = await kvAssetHandler(request, env, ctx, build)
		if (assetResponse) return assetResponse
		return remixHandler(request, env)
	},
	queue,
}
