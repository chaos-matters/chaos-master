import { createSignal, onCleanup, onMount } from 'solid-js'
import { detectWebMcp } from '@/arcade/webmcpDetect'
import ui from './ArcadeHub.module.css'
import type { WebMcpAvailability } from '@/arcade/webmcpDetect'

const LABELS: Record<WebMcpAvailability, string> = {
  detected: 'WebMCP detected',
  mock: 'WebMCP dev mock active',
  none: 'WebMCP not detected',
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
      <summary aria-live="polite">{LABELS[state()]}</summary>
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
