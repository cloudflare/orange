/** @type {import('@remix-run/dev').AppConfig} */
module.exports = {
	devServerBroadcastDelay: 1000,
	ignoredRouteFiles: ['**/.*'],
	server: './server.ts',
	serverConditions: ['worker'],
	serverDependenciesToBundle: [/^(?!__STATIC_CONTENT_MANIFEST).*$/],
	serverMainFields: ['browser', 'module', 'main'],
	serverMinify: true,
	serverModuleFormat: 'esm',
	serverPlatform: 'neutral',
	tailwind: true,
	postcss: true,
	// appDirectory: "app",
	// assetsBuildDirectory: "public/build",
	// serverBuildPath: "build/index.js",
	// publicPath: "/build/",
}
