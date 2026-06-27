import { Show } from 'solid-js'
import ui from './ErrorHandling.module.css'
import type { GpuStatus } from '@/lib/gpuStatus'

/** Where users check whether their browser/device can run WebGPU. */
export const GPUWEB_IMPL_STATUS_URL =
  'https://github.com/gpuweb/gpuweb/wiki/Implementation-Status'

/**
 * In-canvas placeholder shown wherever a Flam3 preview would render when WebGPU
 * is unavailable. AutoCanvas swaps it in for the live <canvas> via its
 * `gpuReady()` gate, so it fills the exact preview rect at all preview sites.
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
    >
      <Show
        when={recovering()}
        fallback={
          <>
            <span class={ui.previewPosterTitle}>
              WebGPU preview unavailable
            </span>
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
