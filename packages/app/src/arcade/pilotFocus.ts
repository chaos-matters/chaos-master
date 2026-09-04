import { createSignal } from 'solid-js'
import type { RecordedAction } from '@/recorder/schema'

/**
 * The agent's latest step, in the shape replay reads, for the live spotlight.
 *
 * It carries the whole action rather than just a hint because that is what
 * `deriveReplayFocusPreparation` reads: the id and args decide which panel to
 * open, which transform to select and which affine tab to show, and a hint
 * alone cannot say. Handing over the same action the recorder writes is what
 * makes the live view and the replay of the same take reveal the same UI.
 */
export type PilotFocusStep = {
  readonly action: RecordedAction
  readonly label: string
  readonly seq: number
}

const [pilotFocus, setPilotFocus] = createSignal<PilotFocusStep | undefined>()
export { pilotFocus }

let sequence = 0

/**
 * One agent step happened. `action` is the same record the recorder appends,
 * `focus` included; a step the focus vocabulary cannot place still counts, so
 * the overlay can retire the previous ring on its own schedule instead of
 * having it snapped away mid-dwell.
 */
export function notePilotFocus(action: RecordedAction, label: string): void {
  sequence += 1
  setPilotFocus({ action, label, seq: sequence })
}

/** No agent is driving any more: drop the ring now, dwell or no dwell. */
export function clearPilotFocus(): void {
  setPilotFocus(undefined)
}
