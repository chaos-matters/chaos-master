import { AudioWiringSnapshot } from '@/flame/schema/audioWiring'
import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { TimelineSnapshot } from '@/flame/schema/timeline'
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

const RecordedActionSchema = v.object({
  /** Milliseconds since the session started. Kept for replay pacing and for
   *  syncing steps against a screen recording of the same session. */
  t: v.pipe(v.number(), v.minValue(0)),
  /** A registered command id, e.g. "flame.setVariationWeight". */
  id: v.pipe(v.string(), v.nonEmpty()),
  /** The command's arguments, JSON-serializable by convention. */
  args: v.array(v.unknown()),
  /** Human-readable command label, resolved from the registry at record
   *  time so a log stays presentable even where the registry is absent. */
  label: v.optional(v.string()),
  /**
   * What to look at while this step runs — a hint like `param:gamma`, not a
   * viewport. The follow-cam resolves it to an element at replay time, so a
   * session recorded in one window size still directs correctly in another
   * (docs/plans/semantic-recorder-plan.md; replay-duel-plan.md §4).
   */
  focus: v.optional(v.string()),
  /**
   * An authored caption, overriding the derived `label`. A derived label reads
   * like a log line ("Set transforms.a.weight to 0.42"); a written one reads
   * like narration ("shear it sideways"). Recording produces the derived one;
   * this is what an author types over it afterwards.
   */
  note: v.optional(v.string()),
  /**
   * How long to hold on this step during playback, overriding the gap the
   * recording measured. Pacing is authorial: a step where something dramatic
   * happens wants a longer hold than three routine ones.
   */
  holdMs: v.optional(v.pipe(v.number(), v.minValue(0))),
})

export type RecordedAction = v.InferOutput<typeof RecordedActionSchema>

// `initial` is validated separately through tryValidateFlame: it dispatches
// 2D vs 3D and migrates old saves, which a plain schema reference would not.
const RecordedSessionShellSchema = v.object({
  version: v.literal(SESSION_FORMAT_VERSION),
  app: v.object({
    version: v.string(),
    flameSchemaVersion: v.string(),
  }),
  createdAt: v.string(),
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
  actions: v.array(RecordedActionSchema),
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
  try {
    return validateSession(JSON.parse(json))
  } catch {
    return undefined
  }
}

/** Same checks against an already-decoded value — the form a session takes
 *  when it arrives from a PNG chunk rather than a file. */
export function validateSession(data: unknown): RecordedSession | undefined {
  const shell = v.safeParse(RecordedSessionShellSchema, data)
  if (!shell.success) return undefined
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
