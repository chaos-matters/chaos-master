import { createSignal, Show } from 'solid-js'
import { webgpuLive, webgpuSupported } from '../lib/webgpuHealth'

const DISMISS_KEY = 'cm-preview-notice-dismissed'

const wasDismissed = (): boolean => {
  try {
    return globalThis.sessionStorage?.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Subtle fixed chip shown only when the live GPU previews can't run — either the
 * browser has no WebGPU at all, or a GPU device-loss latched the page to its
 * static posters ({@link webgpuLive} === false). It tells a visitor on an
 * unsupported browser *why* the flames are still images, so they don't assume
 * the page is broken. Dismissible (remembered for the browser session).
 */
export default function PreviewModeNotice() {
  const [dismissed, setDismissed] = createSignal(wasDismissed())
  const show = () => !webgpuLive() && !dismissed()
  // Two distinct causes: never-supported vs. ran-then-failed.
  const message = () =>
    webgpuSupported()
      ? 'Previews are static — the GPU became unavailable.'
      : "Previews are static — this browser doesn't support WebGPU."

  const dismiss = () => {
    setDismissed(true)
    try {
      globalThis.sessionStorage?.setItem(DISMISS_KEY, '1')
    } catch {
      /* private mode / storage blocked — fine, just won't persist */
    }
  }

  return (
    <Show when={show()}>
      <aside class="preview-notice" role="status">
        <svg
          class="preview-notice-ico"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.5" />
          <path d="M21 16l-5-5L5 20" />
        </svg>
        <span class="preview-notice-text">{message()}</span>
        <button
          class="preview-notice-x"
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          title="Dismiss"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </aside>
    </Show>
  )
}
