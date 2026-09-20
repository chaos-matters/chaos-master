/* @refresh reload */
import './styles/index.css'
import { render } from 'solid-js/web'
import { IS_NATIVE } from './lib/platform'
import { isBenchmarksPath } from './routing/appPath'

// Solid Devtools is opt-in: it instruments every component (a real dev-startup
// cost) and must never ship to production. Enable with `VITE_DEVTOOLS=1 pnpm dev`.
if (import.meta.env.DEV && import.meta.env.VITE_DEVTOOLS) {
  void import('solid-devtools')
}

// Android 15 draws apps edge to edge. Capacitor's SystemBars then runs the
// WebView under the status and navigation bars if the viewport asks for
// `viewport-fit=cover`, which index.html does for iOS, and the layout does not
// pad for Android's bars. Without it, SystemBars keeps the WebView between
// them. It reads the tag at DOMContentLoaded; this module body runs before.
if (IS_NATIVE && /Android/i.test(globalThis.navigator.userAgent)) {
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="viewport"]',
  )) {
    meta.content = meta.content
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== 'viewport-fit=cover')
      .join(', ')
  }
}

const root = document.getElementById('root')

if (!root) {
  throw new Error(`Could not find element with id 'root'`)
}

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  )
}

import { initTelemetry } from './lib/telemetry'

initTelemetry()

const Entry = isBenchmarksPath(window.location.pathname)
  ? (await import('./pages/Benchmarks/BenchmarksApp')).BenchmarksApp
  : (await import('./App')).Wrappers

render(() => <Entry />, root)
