// Even though this api is deprecated, this is one of
// the few ways to detect the meta key in the browser

// eslint-disable-next-line deprecation/deprecation
export const metaKey = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+'
