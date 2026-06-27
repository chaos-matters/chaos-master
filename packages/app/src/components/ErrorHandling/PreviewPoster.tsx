import { Show } from 'solid-js'
import ui from './ErrorHandling.module.css'
import type { GpuStatus } from '@/lib/gpuStatus'

/** Where users check whether their browser/device can run WebGPU. */
export const GPUWEB_IMPL_STATUS_URL =
  'https://github.com/gpuweb/gpuweb/wiki/Implementation-Status'

/** GPU-chip-with-a-slash glyph — reads as "no GPU" even at thumbnail size. */
function GpuOffIcon() {
  return (
    <svg
      class={ui.previewPosterIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h3M7 13.5h2" />
      <circle cx="15.5" cy="12" r="2.2" />
      <path d="M2.5 2.5l19 19" />
    </svg>
  )
}

/**
 * In-canvas placeholder shown wherever a Flam3 preview would render when WebGPU
 * is unavailable. AutoCanvas swaps it in for the live <canvas> via its
 * `gpuReady()` gate, so it fills the exact preview rect at all preview sites.
 *
 * Designed to read as a DELIBERATE placeholder (cyan border + GPU-off icon +
 * label), never to be mistaken for a broken/blank black canvas — and to stay
 * legible from tiny gallery thumbnails up to the full editor canvas via
 * container queries (text/link hide on the smallest tiles; the icon always
 * shows).
 *
 * Deliberately a LEAF module (only solid-js + the css): AutoCanvas is a
 * low-level lib primitive and must not pull the ErrorHandling crash-screen /
 * ConsoleLog graph into the lib import chain.
 */
export function PreviewPoster(props: { status: GpuStatus; class?: string }) {
  const recovering = () => props.status === 'lost-recovering'
  return (
    <div
      data-testid="webgpu-poster"
      data-gpu-status={props.status}
      class={`${ui.previewPoster} ${props.class ?? ''}`}
      role="img"
      aria-label={
        recovering()
          ? 'WebGPU device reconnecting'
          : 'WebGPU preview unavailable'
      }
    >
      <GpuOffIcon />
      <Show
        when={recovering()}
        fallback={
          <>
            <span class={ui.previewPosterTitle}>WebGPU unavailable</span>
            <a
              href={GPUWEB_IMPL_STATUS_URL}
              target="_blank"
              rel="noopener noreferrer"
              class={ui.previewPosterLink}
            >
              Check WebGPU support
            </a>
          </>
        }
      >
        <span class={ui.previewPosterTitle}>Reconnecting…</span>
      </Show>
    </div>
  )
}
