import { getCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { latestSchemaVersion, tryValidateFlame, } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { VERSION } from '@/version'
import { focusForCommand } from '../focus'
import { MAX_SESSION_ACTIONS, MAX_SYNTHETIC_RESIDUAL_ENTRIES, SESSION_FORMAT_VERSION, validateSession, } from '../schema'
import { buildAtoms, glideHintForAtom, isAtomSatisfied } from './atoms'
import { canonicalFlame, diffPaths } from './canonical'
import { createFlameSandbox } from './sandbox'
import { orderAtoms } from './strategies'
import type { RecordedAction, RecordedSession } from '../schema'
import type { CanonicalFlame } from './canonical'
import type { SynthesisStrategy } from './strategies'
import type { GlideStepHint } from '@/flame/glide/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * Synthesized creations — format B.
 *
 * Format A is a real recording: someone pressed Record and the recorder logged
 * what they did. Nearly every flame in the wild predates that, so it carries a
 * descriptor and nothing else. This module produces the SAME container from
 * the descriptor alone: start from the app's default new flame, then add one
 * thing at a time — a transform, a variation, a weight, a colour, a render
 * setting, the camera — until the document equals the target.
 *
 * Two rules keep it honest.
 *
 *  - Every step is one command that already exists and is already replayable,
 *    carrying the same label and follow-cam hint a real recording of that
 *    command would carry. Nothing here invents a selector or a verb.
 *  - The result is not asserted, it is MEASURED: each step runs in a private
 *    sandbox through the registry's own replay path, and whatever the steps
 *    could not reach is both snapped at the end and written down in
 *    `session.synthetic.residual`.
 *
 * The session is marked `synthetic`, and the replay UI says "a possible way to
 * build this" rather than claiming it is how the flame was made.
 */

export const DEFAULT_SYNTHESIS_HOLD_MS = 700
const MAX_SYNTHESIS_HOLD_MS = 10_000
/** One step is always reserved for the closing snap. */
const MAX_SYNTHESIS_STEPS = MAX_SESSION_ACTIONS - 1

export type SynthesisOptions = {
  strategy?: SynthesisStrategy
  seed?: number
  /** Colour before shape wherever the strategy has a free choice. */
  colourFirst?: boolean
  /** Cap on planned steps before the snap. Anything past it is snapped. */
  maxSteps?: number
  /**
   * How long replay holds on each step. Also the spacing of the `t` stamps, so
   * a synthesized session paces like a recording of the same length.
   *
   * This is where the planned morph/blend work attaches: a per-step hold is
   * already part of the format, and a transition hint would sit beside it on
   * the same action without changing anything here.
   */
  holdMs?: number
  /** Fixed clock, so a plan can be byte-identical across runs. */
  createdAt?: string
}

/**
 * A session that rebuilds `target`, or undefined when the input is not a flame.
 *
 * `target` may be a bare descriptor, a legacy one (short variation names, no
 * schema defaults) or the `{ flame, animation }` wrapper a PNG carries — all
 * three go through the app's own validate-and-migrate path first.
 */
export function planCreation(
  target: unknown,
  options: SynthesisOptions = {},
): RecordedSession | undefined {
  const canonicalTarget = canonicalFlame(target)
  if (canonicalTarget === undefined) return undefined
  const base = baseFlameFor(canonicalTarget)
  if (base === undefined) return undefined

  const strategy: SynthesisStrategy = options.strategy ?? 'perTransform'
  const seed = normalizeSeed(options.seed)
  const holdMs = clamp(
    options.holdMs ?? DEFAULT_SYNTHESIS_HOLD_MS,
    0,
    MAX_SYNTHESIS_HOLD_MS,
  )
  const maxSteps = clamp(
    Math.floor(options.maxSteps ?? MAX_SYNTHESIS_STEPS),
    1,
    MAX_SYNTHESIS_STEPS,
  )

  const sandbox = createFlameSandbox(base)
  const { atoms } = buildAtoms(canonicalTarget)
  const ordered = orderAtoms(atoms, {
    strategy,
    seed,
    ...(options.colourFirst === undefined
      ? {}
      : { colourFirst: options.colourFirst }),
  })

  const actions: RecordedAction[] = []
  let truncated = 0
  for (const atom of ordered) {
    // Already true — a step that changes nothing is not a step. This is what
    // drops "set the pre-affine to the identity it already has" and "set this
    // weight to the 1 it was created with" without a table of defaults.
    if (isAtomSatisfied(atom, sandbox.peek())) continue
    if (actions.length >= maxSteps) {
      truncated++
      continue
    }
    // Refusals are not failures to hide: the snap will carry whatever this
    // could not, and `residual` will say so.
    if (!sandbox.execute(atom.id, atom.args)) continue
    if (!isAtomSatisfied(atom, sandbox.peek())) continue
    const action = syntheticAction(
      atom.id,
      atom.args,
      actions.length,
      holdMs,
      glideHintForAtom(atom),
    )
    if (action !== undefined) actions.push(action)
  }

  const reached = canonicalFlame(sandbox.flame())
  const residual = dedupe(diffPaths(reached, canonicalTarget))
  const snapped = residual.length > 0
  if (snapped) {
    // One honest closing step rather than a half-built flame. It is a real
    // `flame.load` — the same command an import records — so the replay ends
    // on exactly the document the file describes.
    const snap = syntheticAction(
      'flame.load',
      [targetDescriptor(target, canonicalTarget), 'Snap to the finished flame'],
      actions.length,
      holdMs,
      // A snap is exactly that: the residue lands at once, and calling it a
      // glide would claim the viewer watched it arrive.
      'cut',
    )
    if (snap !== undefined) actions.push(snap)
  }
  if (truncated > 0) residual.push(`truncated:${truncated}`)

  return validateSession({
    version: SESSION_FORMAT_VERSION,
    app: { version: VERSION, flameSchemaVersion: latestSchemaVersion },
    createdAt: options.createdAt ?? new Date().toISOString(),
    initial: base,
    actions,
    unnamedWriteCount: 0,
    synthetic: {
      strategy,
      seed,
      snapped,
      residual: residual.slice(0, MAX_SYNTHETIC_RESIDUAL_ENTRIES),
    },
  })
}

/**
 * Where a synthesized creation starts: the flame the app itself opens with.
 *
 * Not an empty document — the editor never produces one, and a viewer who
 * knows the app should recognise the first frame. The plan's own first step is
 * `flame.clearTransforms`, which is the app's "start from a blank canvas", so
 * the emptying is something the viewer watches rather than something the file
 * asserts.
 */
export function baseFlameFor(
  target: CanonicalFlame,
): FlameDescriptor | undefined {
  const start =
    target.renderSettings.dimensions === 3
      ? examples.initExample3D
      : examples.initExample
  return tryValidateFlame(deepClone(start))
}

/** The exact document the snap step restores, metadata and all. */
function targetDescriptor(
  original: unknown,
  canonical: CanonicalFlame,
): FlameDescriptor {
  const validated = tryValidateFlame(deepClone(original))
  return validated ?? (canonical as FlameDescriptor)
}

/**
 * One action, built exactly the way `recordCommandExecution` builds one: the
 * command's own `describe` for the caption, falling back to its static label,
 * and the shared follow-cam table for the spotlight. Reusing those means a
 * synthesized step directs the camera at the same control a recorded one does.
 */
function syntheticAction(
  id: string,
  args: readonly unknown[],
  index: number,
  holdMs: number,
  glide: GlideStepHint,
): RecordedAction | undefined {
  const cmd = getCommand(id)
  if (cmd === undefined) return undefined
  const recordedArgs = deepClone([...args])
  const focus = focusForCommand(cmd, [...recordedArgs])
  return {
    t: index * holdMs,
    id,
    args: recordedArgs,
    label: cmd.describe?.([...recordedArgs]) ?? cmd.label,
    ...(focus === undefined ? {} : { focus }),
    holdMs,
    glide,
  }
}

function normalizeSeed(seed: number | undefined): number {
  if (seed === undefined || !Number.isFinite(seed)) return 1
  return Math.abs(Math.floor(seed)) % 0x1_0000_0000
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)]
}
