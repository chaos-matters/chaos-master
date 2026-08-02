/* @refresh reload */
import './styles/index.css'
import { render } from 'solid-js/web'
import { isBenchmarksPath } from './routing/appPath'

// Solid Devtools is opt-in: it instruments every component (a real dev-startup
// cost) and must never ship to production. Enable with `VITE_DEVTOOLS=1 pnpm dev`.
if (import.meta.env.DEV && import.meta.env.VITE_DEVTOOLS) {
  void import('solid-devtools')
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
