/**
 * Glide commands.
 *
 * Three of them, and only one changes the document. `glide.toFlame` carries
 * the target descriptor as data exactly the way `flame.load` does, so a
 * session that glides into a flame still replays without the file it came
 * from. The other two are the mode switches an agent or a script flips once:
 * whether changes animate at all, and at which quality tier.
 *
 * Glide tracks are an EFFECT. None of these writes a keyframe into the user's
 * timeline — the runtime holds the plan and the exporter takes it as data, so
 * the dope sheet someone is authoring in is never disturbed.
 *
 * The two switches write to the context's own `glideSwitches` when it has
 * them, and `glide.toFlame` animates through its own `glideRuntime`: a replay
 * world apart from the workspace keeps a private pair and no runtime, so
 * exporting or checking a take never changes the viewer's switches or canvas.
 */

import { isGlideQualityPreference } from '@/flame/glide/quality'
import { getGlideRuntime, setGlideEnabled, setGlideQualityPreference, } from '@/flame/glide/runtime'
import { MAX_GLIDE_MS } from '@/flame/glide/types'
import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { registerCommand } from '../registry'

function glideMsArg(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value < 0 || value > MAX_GLIDE_MS) return undefined
  return value
}

registerCommand({
  id: 'glide.setEnabled',
  label: 'Animate Changes',
  description:
    'Turn on the animated transition between states. With it off, a change to the flame appears in one step, which is how the editor has always behaved.',
  describe: ([on]) =>
    typeof on === 'boolean'
      ? on
        ? 'Animate changes'
        : 'Stop animating changes'
      : undefined,
  // Neither switch changes a document, so a live flip is no edit: a replay
  // plays or resumes on, and a finished take stays attached.
  preservesFinishedSession: true,
  presentationSwitch: true,
  execute(ctx, on?: unknown) {
    if (typeof on !== 'boolean') return
    ;(ctx.glideSwitches?.setEnabled ?? setGlideEnabled)(on)
  },
})

registerCommand({
  id: 'glide.setQuality',
  label: 'Set Glide Quality',
  description:
    'Choose how much render quality a glide gives up while it moves: "responsive" (fastest), "balanced", "full" (no downshift, so each frame takes longer), or "auto" to follow the render quality preset. A glide always settles at full quality whichever tier is chosen.',
  describe: ([tier]) =>
    typeof tier === 'string' ? `Glide quality: ${tier}` : undefined,
  preservesFinishedSession: true,
  presentationSwitch: true,
  execute(ctx, tier?: unknown) {
    if (!isGlideQualityPreference(tier)) return
    ;(ctx.glideSwitches?.setQuality ?? setGlideQualityPreference)(tier)
  },
})

registerCommand({
  id: 'glide.toFlame',
  label: 'Glide To Flame',
  description:
    'Animate the current flame into another one and land exactly on it. Takes the target descriptor and an optional duration in milliseconds.',
  describe: ([, ms]) =>
    typeof ms === 'number'
      ? `Glide into another flame over ${Math.round(ms)}ms`
      : 'Glide into another flame',
  // Carries the descriptor itself, like `flame.load`, so the log never depends
  // on what happened to be on disk.
  validateReplayArgs(args) {
    if (args.length < 1 || args.length > 2) {
      return 'glide expects a flame and an optional duration'
    }
    if (!tryValidateFlame(deepClone(args[0]))) {
      return 'flame descriptor is invalid'
    }
    if (args.length === 2 && glideMsArg(args[1]) === undefined) {
      return `glide duration must be a number of milliseconds up to ${MAX_GLIDE_MS}`
    }
    return undefined
  },
  execute(ctx, descriptor?: unknown, durationMs?: unknown) {
    const target = tryValidateFlame(deepClone(descriptor))
    if (!target) {
      console.warn('[cmd] glide.toFlame: not a valid flame', descriptor)
      return
    }
    const runtime = (ctx.glideRuntime ?? getGlideRuntime)()
    const ms = glideMsArg(durationMs)
    // Settle anything already in flight FIRST, so this edit lands on a settled
    // document rather than baking a half-interpolated one in — and keep what
    // the viewer could see, so the new glide starts where the eye is.
    const before = deepClone(
      runtime?.settleForNextChange() ?? ctx.flameDescriptor(),
    )
    // One undo entry for the whole transition, not one per frame: the
    // intermediates are silent writes and this is the authored edit. A
    // workspace with no runtime (a sandbox, the replay video driver) still
    // arrives at the target — a glide is presentation, and refusing to change
    // the document because nothing can animate it would be the wrong failure.
    ctx.setFlameDescriptor(() => target, 'Glide to flame')
    if (!runtime || ms === 0) return
    void runtime.glideFrom(before, ms === undefined ? {} : { durationMs: ms })
  },
})
