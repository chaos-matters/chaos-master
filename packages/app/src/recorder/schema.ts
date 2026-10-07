import { GLIDE_STEP_HINTS, MAX_GLIDE_MS } from '@/flame/glide/types'
import { AudioWiringSnapshot } from '@/flame/schema/audioWiring'
import { isSafeFlameEntityId, MAX_FLAME_TRANSFORMS, tryValidateFlame, } from '@/flame/schema/flameSchema'
import { TimelineSnapshot, tryValidateTimelineSnapshot, } from '@/flame/schema/timeline'
import * as v from '@/valibot'
import { SonificationSnapshotSchema, tryValidateSonificationSnapshot, } from './sonificationState'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * The `.steps.json` session format — version 1.
 *
 * A recorded session is INTENTS, not effects: the document the session
 * started from plus the ordered command invocations that transformed it.
 * Patches (what the undo history stores) replay only against the exact same
 * state and mean nothing to a script author; command ids + args can be
 * replayed, edited, parameterized, and survive document-schema migrations
 * (the embedded `initial` goes through the normal migrate-on-parse path).
 *
 * New side-state fields are added as optionals when their command coverage
 * lands — absent fields keep older logs parseable. Engine-specific payloads,
 * such as sonification, also carry their own nested format version.
 */

export const SESSION_FORMAT_VERSION = 1
export const MAX_PALETTE_COLOR_MAGNITUDE = 1_000_000
export const MAX_SESSION_JSON_CHARS = 8 * 1024 * 1024
/** The direct file picker rejects before decoding, so keep its byte budget
 * aligned with the decoded JSON budget. */
export const MAX_SESSION_FILE_BYTES = MAX_SESSION_JSON_CHARS
export const MAX_SESSION_ACTIONS = 2000
/** Each model transition rebuilds a bounded Web Audio graph. Keep a hostile
 * zero-gap session from forcing hundreds of synchronous graph/IR allocations
 * while leaving ample room for a real authored comparison. */
export const MAX_SONIFICATION_MODEL_TRANSITIONS = 16
export const MAX_ACTION_TIMESTAMP_MS = 86_400_000
export const MAX_ACTION_ARGS = 16
export const MAX_ACTION_LABEL_CHARS = 4096
export const MAX_ACTION_FOCUS_CHARS = 512
export const MAX_ACTION_NOTE_CHARS = 16_384
export const MAX_ACTION_HOLD_MS = 600_000
/** A take names at most as many uncaptured steps as it can hold steps; the
 * count past that stays exact, it is only the names that stop. */
export const MAX_UNCAPTURED_STEPS = MAX_SESSION_ACTIONS
export const MAX_UNCAPTURED_REASON_CHARS = 256

const GlideStepHintSchema = v.picklist(GLIDE_STEP_HINTS)

// Command ids are dot-separated, but the existing registry deliberately uses
// camelCase within a segment (`flame.setGamma`, `timeline.loadTimeline`). Keep
// punctuation and whitespace out without rejecting those canonical ids.
function isCommandId(value: string): boolean {
  if (value.length === 0) return false
  const first = value.charCodeAt(0)
  if (first < 97 || first > 122) return false
  let afterSeparator = false
  for (let index = 1; index < value.length; index++) {
    const code = value.charCodeAt(index)
    const alphanumeric =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122)
    if (alphanumeric) {
      afterSeparator = false
      continue
    }
    const separator = code === 46 || code === 45 || code === 95
    if (!separator || afterSeparator) return false
    afterSeparator = true
  }
  return !afterSeparator
}

const RecordedActionSchema = v.object({
  /** Milliseconds since the session started. Kept for replay pacing and for
   *  syncing steps against a screen recording of the same session. */
  t: v.pipe(
    v.number(),
    v.finite(),
    v.minValue(0),
    v.maxValue(MAX_ACTION_TIMESTAMP_MS),
  ),
  /** A registered command id, e.g. "flame.setVariationWeight". */
  id: v.pipe(v.string(), v.nonEmpty(), v.maxLength(128)),
  /** The command's arguments, JSON-serializable by convention. */
  args: v.pipe(v.array(v.unknown()), v.maxLength(MAX_ACTION_ARGS)),
  /** Human-readable command label, resolved from the registry at record
   *  time so a log stays presentable even where the registry is absent. */
  label: v.optional(v.pipe(v.string(), v.maxLength(MAX_ACTION_LABEL_CHARS))),
  /**
   * What to look at while this step runs — a hint like `param:gamma`, not a
   * viewport. The follow-cam resolves it to an element at replay time, so a
   * session recorded in one window size still directs correctly in another
   * (docs/plans/semantic-recorder-plan.md; replay-duel-plan.md §4).
   */
  focus: v.optional(v.pipe(v.string(), v.maxLength(MAX_ACTION_FOCUS_CHARS))),
  /**
   * An authored caption, overriding the derived `label`. A derived label reads
   * like a log line ("Set transforms.a.weight to 0.42"); a written one reads
   * like narration ("shear it sideways"). Recording produces the derived one;
   * this is what an author types over it afterwards.
   */
  note: v.optional(v.pipe(v.string(), v.maxLength(MAX_ACTION_NOTE_CHARS))),
  /**
   * How long to hold on this step during playback, overriding the gap the
   * recording measured. Pacing is authorial: a step where something dramatic
   * happens wants a longer hold than three routine ones.
   */
  holdMs: v.optional(
    v.pipe(
      v.number(),
      v.finite(),
      v.minValue(0),
      v.maxValue(MAX_ACTION_HOLD_MS),
    ),
  ),
  /**
   * How long the animated transition INTO this step should take, overriding
   * both the hint below and the planner's own reading of the change.
   *
   * A sibling of `holdMs` and the same kind of data: authored pacing a human
   * sets in the replay panel, which wins over anything measured or derived.
   * `0` means this step snaps.
   */
  glideMs: v.optional(
    v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(MAX_GLIDE_MS)),
  ),
  /**
   * What KIND of transition this step is — `cut`, `scalar`, `camera`,
   * `variation`, `transform` or `whole` — resolved against the duration table
   * at replay time rather than written as a duration.
   *
   * Shaped like `focus`, and for the same reason: a semantic string survives
   * retuning the pacing, a number in a file does not. A synthesized session
   * sets it from the change it planned; a real recording usually omits it and
   * lets the diff speak for itself.
   */
  glide: v.optional(GlideStepHintSchema),
})

export type RecordedAction = v.InferOutput<typeof RecordedActionSchema>

export const MAX_SYNTHETIC_STRATEGY_CHARS = 32
export const MAX_SYNTHETIC_RESIDUAL_ENTRIES = 64
export const MAX_SYNTHETIC_RESIDUAL_CHARS = 256
const MAX_SYNTHETIC_SEED = 0xffff_ffff

/**
 * Present only on a session that was SYNTHESIZED from a finished flame rather
 * than recorded while someone made it (`recorder/synthesize/`).
 *
 * The two kinds share this container deliberately — replay, the step list, the
 * follow-cam, the video exporter and the `FlameSteps` chunk all work on a
 * session, and a second format would mean a second everything. This field is
 * what keeps them distinguishable, and the replay UI uses it to avoid claiming
 * a plausible reconstruction is how a flame was actually made.
 *
 * Optional, and additive: a session written before this existed simply lacks
 * it, and an older build parses a session that has it and ignores it (the
 * shell schema drops keys it does not know), so the format version is
 * unchanged.
 */
const SyntheticOriginSchema = v.object({
  /** Which journey produced the order — see `SYNTHESIS_STRATEGIES`. Kept as a
   *  bounded string rather than a picklist so the strategy list can grow
   *  without a format change, and so this module stays free of the planner. */
  strategy: v.pipe(
    v.string(),
    v.nonEmpty(),
    v.maxLength(MAX_SYNTHETIC_STRATEGY_CHARS),
  ),
  /** The seed the order was drawn with; the same seed replans identically. */
  seed: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(MAX_SYNTHETIC_SEED),
  ),
  /** True when the steps did not reach the target on their own and the
   *  session ends with a single "snap to the finished flame". */
  snapped: v.optional(v.boolean(), false),
  /** What that snap had to carry — the descriptor paths no command reached. */
  residual: v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.maxLength(MAX_SYNTHETIC_RESIDUAL_CHARS))),
      v.maxLength(MAX_SYNTHETIC_RESIDUAL_ENTRIES),
    ),
    [],
  ),
})

export type SyntheticOrigin = v.InferOutput<typeof SyntheticOriginSchema>

/** Structural validation used by the live recorder before retaining an
 * action. Session-level rules (command-id policy and monotonic ordering) stay
 * in {@link validateSession}, where imported and recorded sessions meet. */
export function validateRecordedAction(
  data: unknown,
): RecordedAction | undefined {
  const result = v.safeParse(RecordedActionSchema, data)
  return result.success ? result.output : undefined
}

/**
 * The transform colours retained by the Palette card so “Unselect” can
 * restore the document as it looked before the first palette application.
 * It is editor state rather than part of the flame descriptor, but it affects
 * the next authored document action and therefore belongs in replay state.
 */
export const TransformColorSnapshotSchema = v.pipe(
  v.record(
    v.string(),
    v.object({
      x: v.pipe(
        v.number(),
        v.finite(),
        v.minValue(-MAX_PALETTE_COLOR_MAGNITUDE),
        v.maxValue(MAX_PALETTE_COLOR_MAGNITUDE),
      ),
      y: v.pipe(
        v.number(),
        v.finite(),
        v.minValue(-MAX_PALETTE_COLOR_MAGNITUDE),
        v.maxValue(MAX_PALETTE_COLOR_MAGNITUDE),
      ),
    }),
  ),
  v.maxEntries(MAX_FLAME_TRANSFORMS),
  v.check((colors) => Object.keys(colors).every(isSafeFlameEntityId)),
)
export type TransformColorSnapshot = v.InferOutput<
  typeof TransformColorSnapshotSchema
>

export function tryValidateTransformColorSnapshot(
  data: unknown,
): TransformColorSnapshot | undefined {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return undefined
  }
  const entries = Object.entries(data)
  // Check the raw object before Valibot materializes a safe record. Special
  // prototype keys are intentionally omitted from record outputs; silently
  // turning a hostile snapshot into an empty, valid one would make preflight
  // accept a different action than the file authored.
  if (
    entries.length > MAX_FLAME_TRANSFORMS ||
    entries.some(([id]) => !isSafeFlameEntityId(id))
  ) {
    return undefined
  }
  const parsed = v.safeParse(TransformColorSnapshotSchema, data)
  return parsed.success ? parsed.output : undefined
}

/** Renderer/editor state that affects what a replay shows but is not stored
 * in the flame descriptor itself. */
export const SessionViewSnapshot = v.object({
  qualityPreset: v.pipe(v.string(), v.nonEmpty()),
  /** Optional so pre-resolution recorder sessions remain importable. */
  pixelRatio: v.optional(v.picklist([1, 0.5, 0.25])),
  adaptiveFilter: v.boolean(),
  stochasticFilter: v.boolean(),
  flyMode: v.boolean(),
  showTimeline: v.boolean(),
  sidebarOpen: v.boolean(),
  /** Optional keeps sessions recorded before palette provenance importable. */
  paletteRestoreColors: v.optional(TransformColorSnapshotSchema),
})
export type SessionViewSnapshot = v.InferOutput<typeof SessionViewSnapshot>

/** One step a take could not record: when, and why, in words for a person
 * (see recorder/uncapturedSteps.ts). */
const UncapturedStepSchema = v.object({
  t: v.pipe(
    v.number(),
    v.finite(),
    v.minValue(0),
    v.maxValue(MAX_ACTION_TIMESTAMP_MS),
  ),
  reason: v.pipe(
    v.string(),
    v.nonEmpty(),
    v.maxLength(MAX_UNCAPTURED_REASON_CHARS),
  ),
})
export type UncapturedStep = v.InferOutput<typeof UncapturedStepSchema>

// `initial` is validated separately through tryValidateFlame: it dispatches
// 2D vs 3D and migrates old saves, which a plain schema reference would not.
const RecordedSessionShellSchema = v.object({
  version: v.literal(SESSION_FORMAT_VERSION),
  app: v.object({
    version: v.pipe(v.string(), v.maxLength(64)),
    flameSchemaVersion: v.pipe(v.string(), v.maxLength(64)),
  }),
  createdAt: v.pipe(v.string(), v.maxLength(128)),
  initial: v.unknown(),
  /**
   * The timeline as it stood when recording started. The timeline is a second
   * document with its own undo stack, so replaying keyframe edits against
   * whatever tracks the viewer happens to have would edit the wrong animation.
   * Absent in sessions recorded before timeline coverage — replay then leaves
   * the timeline alone rather than clearing it.
   */
  initialTimeline: v.optional(TimelineSnapshot),
  /**
   * Audio-reactive wiring at record start. The mapping is data and replays;
   * the audio FILE does not — it never enters the session (see
   * `audioTrackName`, which only names it so a replay can say what is
   * missing).
   */
  initialAudio: v.optional(AudioWiringSnapshot),
  /**
   * Authored Sonification-panel state at Record. Optional keeps sessions from
   * before sonification coverage importable; the nested version evolves this
   * engine-specific contract independently of the recorder format.
   */
  initialSonification: v.optional(SonificationSnapshotSchema),
  /** View state at Record. Optional keeps older session files parseable. */
  initialView: v.optional(SessionViewSnapshot),
  /** Absent on a real recording; present on a plausible reconstruction. */
  synthetic: v.optional(SyntheticOriginSchema),
  actions: v.pipe(
    v.array(RecordedActionSchema),
    v.maxLength(MAX_SESSION_ACTIONS),
  ),
  /** Document writes during recording that did NOT arrive through a
   *  registered command. 0 is the goal state: anything above it means
   *  replay cannot reproduce the session faithfully (the coverage ratchet —
   *  see docs/plans/semantic-recorder-plan.md). */
  unnamedWriteCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  /**
   * The steps that count names, in the order they happened. Optional twice
   * over: a take recorded before names were saved has only the count, and a
   * clean take has nothing to name. Readers that predate it still have the
   * count, which is why the count stays.
   */
  uncapturedSteps: v.optional(
    v.pipe(v.array(UncapturedStepSchema), v.maxLength(MAX_UNCAPTURED_STEPS)),
  ),
})

export type RecordedSession = Omit<
  v.InferOutput<typeof RecordedSessionShellSchema>,
  'initial'
> & { initial: FlameDescriptor }

export function serializeSession(session: RecordedSession): string {
  return JSON.stringify(session, null, 2)
}

/** Parse and validate a `.steps.json` payload. Undefined on any failure:
 *  malformed JSON, unknown format version, or an initial flame that does
 *  not survive validation/migration. */
export function parseSession(json: string): RecordedSession | undefined {
  if (json.length > MAX_SESSION_JSON_CHARS) return undefined
  try {
    return validateSession(JSON.parse(json))
  } catch {
    return undefined
  }
}

function isSessionJsonLengthValid(data: unknown): boolean {
  try {
    const encoded = JSON.stringify(data)
    return encoded !== undefined && encoded.length <= MAX_SESSION_JSON_CHARS
  } catch {
    return false
  }
}

function validateInitialPaletteColors(data: unknown): boolean {
  try {
    if (data !== null && typeof data === 'object') {
      const initialView = (data as { initialView?: unknown }).initialView
      if (initialView !== null && typeof initialView === 'object') {
        const paletteRestoreColors = (
          initialView as { paletteRestoreColors?: unknown }
        ).paletteRestoreColors
        if (
          paletteRestoreColors !== undefined &&
          tryValidateTransformColorSnapshot(paletteRestoreColors) === undefined
        ) {
          return false
        }
      }
    }
    return true
  } catch {
    return false
  }
}

function validateActionTimestampsAndSonification(
  actions: readonly RecordedAction[],
  initialSonificationModel?: string,
): boolean {
  let previousTime = -1
  let sonificationModel = initialSonificationModel
  let sonificationModelTransitions = 0
  for (const action of actions) {
    if (action.t < previousTime) return false
    previousTime = action.t
    if (
      action.id !== 'sonification.setConfig' &&
      action.id !== 'sonification.setEnabled'
    ) {
      continue
    }
    const snapshot = tryValidateSonificationSnapshot(action.args[0])
    if (!snapshot) continue
    if (
      sonificationModel === undefined ||
      snapshot.config.model !== sonificationModel
    ) {
      sonificationModelTransitions++
      if (sonificationModelTransitions > MAX_SONIFICATION_MODEL_TRANSITIONS) {
        return false
      }
    }
    sonificationModel = snapshot.config.model
  }
  return true
}

/** Same checks against an already-decoded value — the form a session takes
 *  when it arrives from a PNG chunk rather than a file. */
export function validateSession(data: unknown): RecordedSession | undefined {
  if (!isSessionJsonLengthValid(data) || !validateInitialPaletteColors(data)) {
    return undefined
  }
  const shell = v.safeParse(RecordedSessionShellSchema, data)
  if (!shell.success) return undefined
  // A list can fall short of the count (the names stop at a cap) but never
  // name steps the count says did not happen.
  if (
    (shell.output.uncapturedSteps?.length ?? 0) > shell.output.unnamedWriteCount
  ) {
    return undefined
  }
  if (
    shell.output.initialTimeline !== undefined &&
    tryValidateTimelineSnapshot(shell.output.initialTimeline) === undefined
  ) {
    return undefined
  }
  // Undo/redo are meaningful only against the history stacks that existed
  // while recording. Current recordings serialize their resulting flame as a
  // validated `flame.load` action instead; refuse hand-edited/early-draft
  // files that would otherwise operate on the viewer's history or no-op inside
  // a replay batch.
  if (
    shell.output.actions.some(
      ({ id }) =>
        !isCommandId(id) || id === 'history.undo' || id === 'history.redo',
    )
  ) {
    return undefined
  }
  if (
    !validateActionTimestampsAndSonification(
      shell.output.actions,
      shell.output.initialSonification?.config.model,
    )
  ) {
    return undefined
  }
  const initial = tryValidateFlame(shell.output.initial)
  if (initial === undefined) return undefined
  return { ...shell.output, initial }
}

export function sessionFilename(flameName?: string): string {
  const base = (flameName ?? '')
    .trim()
    .replace(/[^\w-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${base === '' ? 'session' : base}.steps.json`
}
