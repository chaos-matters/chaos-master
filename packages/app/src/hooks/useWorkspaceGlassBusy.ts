/**
 * The glass busy switch: data-glass="busy" on <html> while the editor canvas
 * presents every frame, which turns the large glass panels solid
 * (styles/designSystem/glass.module.css). Sharp art moving behind text reads
 * worse than an opaque panel, and the blur is re-run on every one of those
 * frames.
 *
 * Busy is the canvas being driven: playback, an export, audio modulation, a
 * gesture - a slider, the camera, a colour or affine drag - holding a history
 * preview open, or the tablet deck's divider being dragged, which resizes or
 * reframes the canvas on every step. The canvas converging after an edit is not busy: it would
 * flicker the panels solid after every change. So is a tap, which opens a
 * preview and closes it at once; the attribute follows the state only once it
 * has held for GLASS_BUSY_SETTLE_MS, in both directions.
 */
import { createEffect, createMemo, on, onCleanup } from 'solid-js'
import { animationExportRunning } from '@/flame/renderStats'
import { deckResizing } from '@/lib/canvasFraming'
import { writeGlassBusy } from '@/lib/glass'
import type { Accessor } from 'solid-js'

export interface CanvasBusyStates {
  /** The animation playing. */
  readonly playing: boolean
  /** A still or an animation rendering out. */
  readonly exporting: boolean
  /** Audio-reactive modulation moving the overlay (useAudioReactive). */
  readonly audioModulating: boolean
  /** A gesture holding a history preview open. */
  readonly dragging: boolean
  /** The tablet deck's divider moving under a finger (lib/canvasFraming.ts). */
  readonly resizing: boolean
}

export function isCanvasBusy(states: CanvasBusyStates): boolean {
  return (
    states.playing ||
    states.exporting ||
    states.audioModulating ||
    states.dragging ||
    states.resizing
  )
}

/** How long a state must hold before the panels follow it. */
export const GLASS_BUSY_SETTLE_MS = 150

export interface UseWorkspaceGlassBusyParams {
  timeline: { isPlaying: Accessor<boolean> }
  history: { hasOpenPreview: () => boolean }
  exportStore: { onExportImage: Accessor<unknown> }
  audioModulating: Accessor<boolean>
}

export function useWorkspaceGlassBusy(params: UseWorkspaceGlassBusyParams) {
  const busy = createMemo(() =>
    isCanvasBusy({
      playing: params.timeline.isPlaying(),
      exporting:
        params.exportStore.onExportImage() !== undefined ||
        animationExportRunning(),
      audioModulating: params.audioModulating(),
      dragging: params.history.hasOpenPreview(),
      resizing: deckResizing(),
    }),
  )

  let settle: ReturnType<typeof setTimeout> | undefined
  createEffect(
    on(busy, (next) => {
      clearTimeout(settle)
      settle = setTimeout(() => {
        writeGlassBusy(next)
      }, GLASS_BUSY_SETTLE_MS)
    }),
  )

  // The workspace leaving takes the switch with it: nothing else clears it.
  onCleanup(() => {
    clearTimeout(settle)
    writeGlassBusy(false)
  })
}
