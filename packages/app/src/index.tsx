/* @refresh reload */
import './styles/index.css'
import { render } from 'solid-js/web'
import { loadHaptics } from './lib/haptics'
import { loadLifecycle } from './lib/lifecycle'
import { IS_NATIVE, nativePlatform } from './lib/platform'
import { isBenchmarksPath } from './routing/appPath'

// Solid Devtools is opt-in: it instruments every component (a real dev-startup
// cost) and must never ship to production. Enable with `VITE_DEVTOOLS=1 pnpm dev`.
if (import.meta.env.DEV && import.meta.env.VITE_DEVTOOLS) {
  void import('solid-devtools')
}

const platform = nativePlatform(IS_NATIVE, globalThis.navigator.userAgent)

// The styles that differ by platform read this: lumen.css raises the minimum
// target to Android's 48dp under [data-platform='android'].
if (platform) {
  document.documentElement.dataset.platform = platform
}

// Android 15 draws apps edge to edge. Capacitor's SystemBars then runs the
// WebView under the status and navigation bars if the viewport asks for
// `viewport-fit=cover`, which index.html does for iOS, and the layout does not
// pad for Android's bars. Without it, SystemBars keeps the WebView between
// them. It reads the tag at DOMContentLoaded; this module body runs before.
if (platform === 'android') {
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

// Binds the Capacitor haptic ports in the native build; a no-op on the web.
// Not awaited: nothing on screen waits for a vibration motor.
void loadHaptics()

// Same shape for the lifecycle: the Android back gesture has to reach the back
// registry from the first frame, and the web keeps its visibilitychange ports.
void loadLifecycle()

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
