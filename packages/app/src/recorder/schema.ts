import { AudioWiringSnapshot } from '@/flame/schema/audioWiring'
import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { TimelineSnapshot, tryValidateTimelineSnapshot, } from '@/flame/schema/timeline'
import * as v from '@/valibot'
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
 * Optional fields planned for later milestones (a session RNG `seed`,
 * `initialTracks` for the timeline) are added as optionals when the code
 * that populates them lands — absent fields keep old logs parseable.
 */

export const SESSION_FORMAT_VERSION = 1
export const MAX_SESSION_JSON_CHARS = 8 * 1024 * 1024
/** The direct file picker rejects before decoding, so keep its byte budget
 * aligned with the decoded JSON budget. */
export const MAX_SESSION_FILE_BYTES = MAX_SESSION_JSON_CHARS
export const MAX_SESSION_ACTIONS = 2000
export const MAX_ACTION_TIMESTAMP_MS = 86_400_000
export const MAX_ACTION_ARGS = 16
export const MAX_ACTION_LABEL_CHARS = 4096
export const MAX_ACTION_FOCUS_CHARS = 512
export const MAX_ACTION_NOTE_CHARS = 16_384
export const MAX_ACTION_HOLD_MS = 600_000

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
})

export type RecordedAction = v.InferOutput<typeof RecordedActionSchema>

/** Structural validation used by the live recorder before retaining an
 * action. Session-level rules (command-id policy and monotonic ordering) stay
 * in {@link validateSession}, where imported and recorded sessions meet. */
export function validateRecordedAction(
  data: unknown,
): RecordedAction | undefined {
  const result = v.safeParse(RecordedActionSchema, data)
  return result.success ? result.output : undefined
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
})
export type SessionViewSnapshot = v.InferOutput<typeof SessionViewSnapshot>

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
  /** View state at Record. Optional keeps older session files parseable. */
  initialView: v.optional(SessionViewSnapshot),
  actions: v.pipe(
    v.array(RecordedActionSchema),
    v.maxLength(MAX_SESSION_ACTIONS),
  ),
  /** Document writes during recording that did NOT arrive through a
   *  registered command. 0 is the goal state: anything above it means
   *  replay cannot reproduce the session faithfully (the coverage ratchet —
   *  see docs/plans/semantic-recorder-plan.md). */
  unnamedWriteCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
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

/** Same checks against an already-decoded value — the form a session takes
 *  when it arrives from a PNG chunk rather than a file. */
export function validateSession(data: unknown): RecordedSession | undefined {
  try {
    const encoded = JSON.stringify(data)
    if (encoded === undefined || encoded.length > MAX_SESSION_JSON_CHARS) {
      return undefined
    }
  } catch {
    return undefined
  }
  const shell = v.safeParse(RecordedSessionShellSchema, data)
  if (!shell.success) return undefined
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
  let previousTime = -1
  for (const action of shell.output.actions) {
    if (action.t < previousTime) return undefined
    previousTime = action.t
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
