import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		exclude: ['**/e2e-tests/**', '**/node_modules/**'],
	},
	resolve: {
		alias: {
			'~': path.resolve(__dirname, './app'),
		},
	},
})
