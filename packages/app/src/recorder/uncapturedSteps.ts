/**
 * The steps a take could not record, by name.
 *
 * A take has always counted what it could not capture (`unnamedWriteCount`),
 * and a count alone is not something a person can act on: "1 not captured"
 * says a replay will differ, not where or why. This module owns the rest of
 * the answer. The recorder keeps an {@link UncapturedLog} while a take runs
 * and writes it into the session; the recorder controls, the library, the
 * replay panel, the export notice and the console line a stop writes all read
 * it back through {@link summarizeUncapturedSteps}, so they say the same thing
 * in the same words.
 */
import { MAX_ACTION_TIMESTAMP_MS, MAX_UNCAPTURED_REASON_CHARS, MAX_UNCAPTURED_STEPS, } from './schema'
import type { RecordedSession, UncapturedStep } from './schema'

/** Shown in place of names for a take recorded before they were saved. */
export const UNCAPTURED_DETAILS_MISSING =
  'Details were not saved by the version that recorded it.'

/** Every uncaptured step of the take being recorded: how many, the ones a
 *  file keeps by name, and what naming those adds to the compact session JSON
 *  the recorder budgets. */
export type UncapturedLog = {
  /** Every step, named or not: the session's `unnamedWriteCount`. */
  count: number
  /** The first {@link MAX_UNCAPTURED_STEPS}, which is all a file keeps. */
  steps: UncapturedStep[]
  /** Compact JSON length of the named steps, commas excluded. */
  jsonChars: number
}

export function createUncapturedLog(): UncapturedLog {
  return { count: 0, steps: [], jsonChars: 0 }
}

/** Record one, and say whether it was named. Every step is counted; only the
 *  first {@link MAX_UNCAPTURED_STEPS} are kept, since that is all a file
 *  names, so a flood of unrouted writes costs a number each rather than a
 *  list that grows without end. The time is held to the session's timestamp
 *  range: the step that says a take ran past its 24-hour limit happens after
 *  that limit, and must not be what makes the whole file unreadable. */
export function noteUncapturedStep(
  log: UncapturedLog,
  t: number,
  reason: string,
): boolean {
  log.count++
  if (log.steps.length >= MAX_UNCAPTURED_STEPS) return false
  const at = Number.isFinite(t)
    ? Math.min(Math.max(0, t), MAX_ACTION_TIMESTAMP_MS)
    : MAX_ACTION_TIMESTAMP_MS
  const step = { t: at, reason: clipReason(reason) }
  log.steps.push(step)
  log.jsonChars += JSON.stringify(step).length
  return true
}

/** The session fields a log becomes. A clean take carries no list at all,
 *  exactly as it did before names were saved. */
export function uncapturedSessionFields(
  log: UncapturedLog,
): Pick<RecordedSession, 'unnamedWriteCount' | 'uncapturedSteps'> {
  if (log.count === 0) return { unnamedWriteCount: 0 }
  return { unnamedWriteCount: log.count, uncapturedSteps: [...log.steps] }
}

/** What the log adds to a session whose baseline was measured with a count of
 *  0 and no list: the count's extra digits, plus `,"uncapturedSteps":[...]`. */
export function uncapturedJsonChars(log: UncapturedLog): number {
  if (log.count === 0) return 0
  const field = ',"uncapturedSteps":[]'.length
  const commas = log.steps.length - 1
  return String(log.count).length - 1 + field + log.jsonChars + commas
}

/** Anything that carries a take's count and, when its recorder saved them,
 *  the names: a session, a library entry's session, the live recorder. */
export type UncapturedSource = {
  unnamedWriteCount: number
  uncapturedSteps?: readonly UncapturedStep[]
}

export type UncapturedSummary = {
  count: number
  /** "Reason, at m:ss", one per named step, in the order they happened. */
  lines: string[]
  /** When the first named one happened, in take time. */
  firstAtMs: number | undefined
  /** What the lines cannot say: that the names were never saved, or how many
   *  the list stopped short of. */
  note: string | undefined
}

export function summarizeUncapturedSteps(
  session: UncapturedSource,
): UncapturedSummary {
  const count = session.unnamedWriteCount
  const steps = session.uncapturedSteps
  const lines = (steps ?? []).map(describeUncapturedStep)
  const unlisted = count - lines.length
  return {
    count,
    lines,
    firstAtMs: steps?.[0]?.t,
    note:
      count === 0
        ? undefined
        : steps === undefined
          ? UNCAPTURED_DETAILS_MISSING
          : unlisted > 0
            ? `${unlisted} more ${unlisted === 1 ? 'was' : 'were'} not listed.`
            : undefined,
  }
}

/** A write that reached a document without going through a command: named by
 *  the history entry's own description ("Exposure") when it has one. */
export function describeUnroutedEdit(description: string | undefined): string {
  const what = description?.trim()
  if (!what) return 'An edit made outside the recorded commands'
  const named = `${what.charAt(0).toUpperCase()}${what.slice(1)}`
  return `${named}, made outside the recorded commands`
}

/** A command that runs but is not a step (`recordable: false`), and that
 *  changes something a replay reproduces: one that does not, an export, is
 *  not an uncaptured step at all (`preservesFinishedSession`). */
export function describeUnrecordedCommand(label: string): string {
  return `${label}, a command a recording does not replay`
}

/** The line a stop writes to the console, so a take's gaps are on record
 *  where a developer is already looking. Undefined for a clean take. */
export function uncapturedStopMessage(
  session: UncapturedSource,
): string | undefined {
  const { count, lines, note } = summarizeUncapturedSteps(session)
  if (count === 0) return undefined
  const head =
    count === 1
      ? '1 step of this take was not captured, so a replay will not reproduce it:'
      : `${count} steps of this take were not captured, so a replay will not reproduce them:`
  return [head, ...lines, ...(note === undefined ? [] : [note])].join('\n  ')
}

/** One step as a person reads it: "Exposure, made outside the recorded
 *  commands, at 0:43". The time is take time, as the recorder measured it. */
export function describeUncapturedStep(step: UncapturedStep): string {
  return `${step.reason}, at ${formatTakeTime(step.t)}`
}

/**
 * What an export will do with a take that has uncaptured steps, said before
 * it starts. The replay applies the recorded steps and nothing else, so it
 * matches the take up to the first step recorded after the first uncaptured
 * one; `actions` locates that step for the viewer, who sees steps numbered in
 * the replay panel rather than take time.
 */
export function describeExportSkips(
  session: UncapturedSource & { actions: readonly { t: number }[] },
): string | undefined {
  const { count, firstAtMs } = summarizeUncapturedSteps(session)
  if (count === 0) return undefined
  const head = `This take has ${count === 1 ? '1 step' : `${count} steps`} it did not capture. The video skips ${count === 1 ? 'it' : 'them'}, so`
  if (firstAtMs === undefined) {
    return `${head} it may differ from what was recorded.`
  }
  const step = session.actions.findIndex(({ t }) => t >= firstAtMs)
  return step < 0
    ? `${head} the finished flame may differ from what was recorded.`
    : `${head} from step ${step + 1} on it may differ from what was recorded.`
}

/** Take time as m:ss. Minutes keep counting past the hour: a take is capped
 *  at a day, and "62:03" is unambiguous where a wrapped "1:02:03" would sit
 *  next to "0:43" in the same list. */
function formatTakeTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const seconds = total % 60
  return `${Math.floor(total / 60)}:${seconds.toString().padStart(2, '0')}`
}

function clipReason(reason: string): string {
  const text = reason.trim() === '' ? 'An uncaptured step' : reason.trim()
  return text.length <= MAX_UNCAPTURED_REASON_CHARS
    ? text
    : `${text.slice(0, MAX_UNCAPTURED_REASON_CHARS - 3)}...`
}
