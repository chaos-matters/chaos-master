/**
 * How long a replayed step's transition lasts.
 *
 * One function, because the live player, the artwork schedule and the
 * interface capture must agree: `replayInterfaceVideo` validates its encoder
 * budget from the schedule and then screen-records the live player, so a
 * difference between the two overruns the capture. That is the same reason
 * `stepGapMs` is shared, and this is its sibling.
 *
 * The answer is always a definite number rather than "let the planner decide",
 * for the same reason: a schedule has to know how many frames a glide takes
 * before anything has been planned, and a length the two paths derive
 * differently is a length they disagree about.
 */

import { getCommand } from '@/commands/registry'
import { qualityPresets } from '@/components/Quality/QualityPresets'
import { clampGlideMs, glideMsForHint } from '@/flame/glide/durations'
import { isGlideQualityPreference, resolveGlideQuality, } from '@/flame/glide/quality'
import type { RecordedAction, RecordedSession } from './schema'
import type { SelfGlide } from '@/commands/types'
import type { GlideQualityPreference, GlideQualityTier, } from '@/flame/glide/types'

/**
 * What a step with nothing to say gets.
 *
 * Between the scalar and the transform entries of the duration table: a real
 * recording carries no hint, so this is the length most replayed steps use,
 * and it has to be watchable for a weight nudge and for an added transform
 * alike.
 */
export const DEFAULT_REPLAY_GLIDE_MS = 600

export type ReplayGlideOptions = {
  /** Off means every step cuts, exactly as replay has always behaved. */
  enabled: boolean
  /** The length for a step that carries neither a duration nor a hint. */
  defaultMs?: number
  /** The quality tier's duration multiplier. */
  durationScale?: number
  /**
   * Which tier the glide frames render at. Travels with an export job, with
   * `preference`, so a background render downshifts the same way the live one
   * does, and so the tier a demo was captured at is recorded in the job rather
   * than read from whatever the workspace happened to be set to when it ran.
   */
  tier?: GlideQualityTier
  /** The viewer's quality switch a replay starts from, `auto` included; the
   *  take's own steps switch it from there (see {@link glideOptionsByStep}). */
  preference?: GlideQualityPreference
}

/** How the command of a step glides itself, if it does (`glide.toFlame`). */
export function selfGlideOf(id: string): SelfGlide | undefined {
  return getCommand(id)?.glidesItself
}

/**
 * The glide INTO `action`, in milliseconds. Zero means this step snaps.
 *
 * Precedence: a command that glides itself and names its duration wins, since
 * that is the one glide the step runs (see `FlameCommand.glidesItself`). Then
 * an authored `glideMs`, which is not second-guessed — pacing is authorial,
 * and `glideMs: 0` means zero. Then the semantic `glide` hint, resolved
 * against the duration table now rather than baked into the file. Then the
 * caller's default.
 */
export function glideMsForAction(
  action: RecordedAction | undefined,
  options: ReplayGlideOptions,
): number {
  if (!options.enabled || action === undefined) return 0
  const own = selfGlideOf(action.id)?.durationMs(action.args)
  if (own !== undefined) return clampGlideMs(own)
  if (action.glideMs !== undefined) return clampGlideMs(action.glideMs)
  const scale = options.durationScale ?? 1
  const hinted = glideMsForHint(action.glide, scale)
  if (hinted !== undefined) return hinted
  return clampGlideMs((options.defaultMs ?? DEFAULT_REPLAY_GLIDE_MS) * scale)
}

const presetOf = (key: unknown) =>
  typeof key === 'string' && key in qualityPresets ? key : undefined

/**
 * The options for the glide into each step, at the tier in force once it ran,
 * as the live replay's glides take it: from the viewer's `preference`, switched
 * by the take's `glide.setQuality` steps, and under `auto` by the preset of its
 * view and `view.setQualityPreset` steps. `glide.setEnabled` changes nothing.
 */
export function glideOptionsByStep(
  session: Pick<RecordedSession, 'actions' | 'initialView'>,
  glide: ReplayGlideOptions,
): (ReplayGlideOptions & { tier: GlideQualityTier })[] {
  let preference = glide.preference ?? glide.tier ?? 'auto'
  let preset = presetOf(session.initialView?.qualityPreset)
  return session.actions.map(({ id, args: [value] }) => {
    if (id === 'glide.setQuality' && isGlideQualityPreference(value)) {
      preference = value
    }
    if (id === 'view.setQualityPreset') preset = presetOf(value) ?? preset
    // `auto` with no preset in the take: the tier the viewer's own gave.
    const { tier, durationScale } = resolveGlideQuality(
      preference === 'auto' && preset === undefined ? glide.tier : preference,
      preset,
    )
    return { ...glide, tier, durationScale }
  })
}
