import { createSignal, onCleanup, onMount } from 'solid-js'
import { detectWebMcp } from '@/arcade/webmcpDetect'
import ui from './ArcadeHub.module.css'
import type { WebMcpAvailability } from '@/arcade/webmcpDetect'

const NOT_DETECTED = 'WebMCP not detected in this browser'

const LABELS: Record<WebMcpAvailability, string> = {
  detected: 'WebMCP detected',
  mock: 'WebMCP dev mock active',
  none: NOT_DETECTED,
}

/**
 * What the pill says out loud.
 *
 * `registerWebMcp` installs the dev mock on `window.webmcp` for every browser
 * without `document.modelContext`, so on a deployed URL the `mock` state means
 * nothing more than "this browser has no WebMCP" — and saying "dev mock active"
 * there tells a visitor the production site is a development build. The state
 * itself stays `mock` and is still published as `data-state`, so Playwright and
 * the console can tell the two apart.
 */
export function webMcpStatusLabel(
  state: WebMcpAvailability,
  isDev: boolean,
): string {
  if (state === 'mock' && !isDev) return NOT_DETECTED
  return LABELS[state]
}

export function WebMcpStatusPill() {
  const [state, setState] = createSignal<WebMcpAvailability>(detectWebMcp())
  onMount(() => {
    // The dev mock is installed when the workspace mounts, which can be after
    // the hub renders; re-check once.
    const timer = window.setTimeout(() => setState(detectWebMcp()), 1500)
    onCleanup(() => {
      window.clearTimeout(timer)
    })
  })
  return (
    <details class={ui.pill} data-state={state()} data-testid="webmcp-status">
      <summary aria-live="polite">
        {webMcpStatusLabel(state(), import.meta.env.DEV)}
      </summary>
      <div class={ui.pillBody}>
        <p>
          Open this page in ChatGPT's desktop browser, or in Chrome 149+ with{' '}
          <code>chrome://flags/#enable-webmcp-testing</code> enabled. The Model
          Context Tool Inspector extension lets you call the tools by hand.
        </p>
        <p>WebGPU is required for rendering.</p>
      </div>
    </details>
  )
}
