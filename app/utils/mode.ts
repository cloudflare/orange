import invariant from 'tiny-invariant'

const modes = ['production', 'development', 'test'] as const
export type Mode = (typeof modes)[number]

// This is the ONLY place in the app that we use process.env
// because Remix does a find and replace for this string, but
// it is otherwise unavailable in the workers runtime and env
// variables should be passed in through wrangler and consumed
// through the AppLoadConext
const NODE_ENV = process.env.NODE_ENV

const foundMode = modes.find((m) => m === NODE_ENV)
invariant(foundMode)

export const mode = foundMode
