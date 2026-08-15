import { batch } from 'solid-js'
import { deepClone } from '@/utils/clone'
import * as v from '@/valibot'
import type { SonificationConfig } from '@/utils/sonification'

/**
 * Sonification is authored output state, but it is not part of the flame
 * document. Keep its session payload independently versioned so a future
 * engine can migrate this small contract without changing the whole recorder
 * format.
 *
 * AudioContext/device state, playback lifetime and the "keep playing when
 * closed" preference are deliberately absent. A recording carries only the
 * reproducible controls exposed by the Sonification panel.
 */
export const SONIFICATION_SNAPSHOT_VERSION = 1

export const SonificationConfigSnapshotSchema = v.object({
  model: v.picklist(['orchestral', 'ambient', 'percussive']),
  volume: v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1)),
  updateRate: v.pipe(
    v.number(),
    v.finite(),
    v.integer(),
    v.minValue(1),
    v.maxValue(120),
  ),
  scale: v.picklist(['pentatonicMajor', 'pentatonicMinor', 'chromatic']),
  voiceCount: v.pipe(
    v.number(),
    v.finite(),
    v.integer(),
    v.minValue(2),
    v.maxValue(16),
  ),
  harmonicDensity: v.pipe(
    v.number(),
    v.finite(),
    v.minValue(0.2),
    v.maxValue(3),
  ),
  triggerRate: v.pipe(
    v.number(),
    v.finite(),
    v.integer(),
    v.minValue(1),
    v.maxValue(16),
  ),
  spatialSpread: v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1)),
  reverbMix: v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1)),
})

export const SonificationSnapshotSchema = v.object({
  version: v.literal(SONIFICATION_SNAPSHOT_VERSION),
  enabled: v.boolean(),
  config: SonificationConfigSnapshotSchema,
})

export type SonificationSnapshot = v.InferOutput<
  typeof SonificationSnapshotSchema
>

export type SonificationSnapshotTarget = {
  setConfig: (config: SonificationConfig) => void
  setEnabled: (enabled: boolean) => void
}

export type AuthoredSonificationPanelClose = {
  shouldDisable: () => boolean
  disable: () => void
  hide: () => void
}

export type SonificationVisibilityPolicyState = {
  enabled: boolean
  panelVisible: boolean
  keepPlayingWhenClosed: boolean
  replayPreservesOutput: boolean
}

/** Apply the complete authored state atomically so an engine never observes a
 * new config under the previous enabled flag (or vice versa). */
export function applySonificationSnapshot(
  snapshot: SonificationSnapshot,
  target: SonificationSnapshotTarget,
): void {
  batch(() => {
    target.setConfig(deepClone(snapshot.config))
    target.setEnabled(snapshot.enabled)
  })
}

/**
 * Close a user-visible sonification surface without letting its visibility
 * safety effect silently swallow an authored stop. The caller supplies the
 * semantic disable command; replay/reset paths should continue to restore
 * their state directly and must not use this helper.
 */
export function closeAuthoredSonificationPanel(
  target: AuthoredSonificationPanelClose,
): void {
  if (target.shouldDisable()) target.disable()
  target.hide()
}

/** Presentation-only replay focus must not mutate authored audio output. */
export function shouldStopHiddenSonification(
  state: SonificationVisibilityPolicyState,
): boolean {
  return (
    state.enabled &&
    !state.panelVisible &&
    !state.keepPlayingWhenClosed &&
    !state.replayPreservesOutput
  )
}

/** Once replay releases presentation ownership, enabled output needs a
 * reachable stop control unless the user opted into hidden playback. */
export function shouldRevealSonificationAfterReplay(
  state: Omit<SonificationVisibilityPolicyState, 'replayPreservesOutput'>,
): boolean {
  return state.enabled && !state.panelVisible && !state.keepPlayingWhenClosed
}

export function tryValidateSonificationConfig(
  value: unknown,
): SonificationConfig | undefined {
  const parsed = v.safeParse(SonificationConfigSnapshotSchema, value)
  return parsed.success ? parsed.output : undefined
}

export function tryValidateSonificationSnapshot(
  value: unknown,
): SonificationSnapshot | undefined {
  const parsed = v.safeParse(SonificationSnapshotSchema, value)
  return parsed.success ? parsed.output : undefined
}
