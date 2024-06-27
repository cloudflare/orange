import { RemixBrowser } from '@remix-run/react'
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'

hydrateRoot(
	document,
	<StrictMode>
		<RemixBrowser />
	</StrictMode>
)
