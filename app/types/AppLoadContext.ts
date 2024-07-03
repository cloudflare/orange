// need to import the module in order for the declaration
// below to extend it instead of overwriting it.
// https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation
import '@remix-run/cloudflare'
import type { Mode } from '~/utils/mode'
import type { Env } from './Env'

declare module '@remix-run/cloudflare' {
	export interface AppLoadContext {
		env: Env
		mode: Mode
	}
}
