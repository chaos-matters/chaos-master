import { createSignal } from 'solid-js'
import { latestSchemaVersion } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { VERSION } from '@/version'
import { SESSION_FORMAT_VERSION } from './schema'
import type { RecordedAction, RecordedSession } from './schema'
import type { FlameCommand } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * The session recorder: turns an editing session into a `.steps.json` log of
 * registered-command invocations (see schema.ts for why intents, not patches).
 *
 * Module-global like the command registry itself, and hooked into exactly two
 * seams:
 *
 *  - `executeCommand` calls {@link recordCommandExecution}, so everything that
 *    is command-routed is recorded for free. Only TOP-LEVEL commands land in
 *    the log — a command that runs other commands replays them itself.
 *  - The main flame history calls {@link reportDocumentWrite} whenever an
 *    entry lands on its undo stack (via `createStoreHistory`'s
 *    `onEntryPushed`). A push that happens OUTSIDE any command scope is a
 *    mutation the recorder cannot replay — it is counted as an "unnamed
 *    write" rather than silently dropped. Driving that count to zero is the
 *    coverage ratchet of docs/plans/semantic-recorder-plan.md; until then the
 *    count is the log's honesty marker.
 *
 * `history.setSilently` writers (animation export frames, follower effects)
 * never push history entries, so they stay invisible here by construction —
 * which is correct: they are not user intent.
 *
 * Replay and other machinery that executes commands without a user behind
 * them must wrap itself in {@link withRecordingSuppressed} so an active
 * recording does not absorb it.
 */

type ActiveRecording = {
  startedAt: number
  createdAt: string
  initial: FlameDescriptor
  actions: RecordedAction[]
  unnamedWrites: { t: number; description?: string }[]
}

let active: ActiveRecording | undefined
let commandDepth = 0
let suppressDepth = 0

const [isSessionRecording, setIsSessionRecording] = createSignal(false)
const [recordedActionCount, setRecordedActionCount] = createSignal(0)
const [unnamedWriteCount, setUnnamedWriteCount] = createSignal(0)

export { isSessionRecording, recordedActionCount, unnamedWriteCount }

function elapsedMs(rec: ActiveRecording): number {
  return Math.max(0, globalThis.performance.now() - rec.startedAt)
}

/** Begin recording. `initial` is cloned, never held — pass the full current
 *  document (NOT condensed: hidden transforms must survive into replay). */
export function startSessionRecording(initial: FlameDescriptor): void {
  if (active) {
    console.warn('[recorder] A session recording is already active.')
    return
  }
  active = {
    startedAt: globalThis.performance.now(),
    createdAt: new Date().toISOString(),
    initial: deepClone(initial),
    actions: [],
    unnamedWrites: [],
  }
  setRecordedActionCount(0)
  setUnnamedWriteCount(0)
  setIsSessionRecording(true)
}

export function stopSessionRecording(): RecordedSession | undefined {
  if (!active) return undefined
  const session: RecordedSession = {
    version: SESSION_FORMAT_VERSION,
    app: { version: VERSION, flameSchemaVersion: latestSchemaVersion },
    createdAt: active.createdAt,
    initial: active.initial,
    actions: active.actions,
    unnamedWriteCount: active.unnamedWrites.length,
  }
  active = undefined
  setIsSessionRecording(false)
  return session
}

export function cancelSessionRecording(): void {
  active = undefined
  setIsSessionRecording(false)
}

/**
 * The registry's wrapper around every command execution. Records the
 * invocation (top-level, unsuppressed, while a recording is active), then
 * runs it inside a command scope so history pushes it causes are attributed
 * to it instead of being flagged as unnamed writes.
 *
 * Args are cloned via the JSON-based `deepClone`, matching the convention
 * that command args are plain data — a non-serializable arg would break
 * replay anyway and is caught by schema validation on load.
 */
export function recordCommandExecution(
  cmd: Pick<FlameCommand, 'id' | 'label'>,
  args: readonly unknown[],
  run: () => void,
): void {
  const rec = active
  if (rec && commandDepth === 0 && suppressDepth === 0) {
    rec.actions.push({
      t: elapsedMs(rec),
      id: cmd.id,
      args: deepClone([...args]),
      label: cmd.label,
    })
    setRecordedActionCount(rec.actions.length)
  }
  commandDepth++
  try {
    run()
  } finally {
    commandDepth--
  }
}

/** Coverage hook: called by the main flame history for every entry that
 *  lands on its stack. Outside a command scope that entry is a mutation the
 *  log cannot replay — count it and say so. */
export function reportDocumentWrite(description?: string): void {
  const rec = active
  if (!rec || commandDepth > 0 || suppressDepth > 0) return
  rec.unnamedWrites.push({ t: elapsedMs(rec), description })
  setUnnamedWriteCount(rec.unnamedWrites.length)
  console.warn(
    '[recorder] Unnamed write during recording — not replayable:',
    description ?? '(no description)',
  )
}

/** Run `fn` invisibly to any active recording: its commands are not logged
 *  and its document writes are not flagged. For replay, the Home portal, and
 *  any other machinery executing commands without a user behind them. */
export function withRecordingSuppressed<T>(fn: () => T): T {
  suppressDepth++
  try {
    return fn()
  } finally {
    suppressDepth--
  }
}
