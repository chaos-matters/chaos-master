import { createSignal } from 'solid-js'
import { clearPilotFocus } from './pilotFocus'
import type { RecordedSession } from '@/recorder/schema'

/**
 * "An agent is driving the editor" as one module-global state, the same way
 * `webmcp/contextBridge.ts` holds the command context: the tools, the lock
 * overlay and the shortcut manager all read it, none of them own it.
 */
export type PilotMode = 'teach' | 'cinema' | 'duel' | 'beats'
export type PilotEndReason = 'finished' | 'stopped' | 'budget' | 'error'
export type PilotLogKind = 'command' | 'narrate' | 'error' | 'system'
export type PilotLogEntry = { t: number; kind: PilotLogKind; text: string }

export type PilotDriving = {
  phase: 'driving'
  mode: PilotMode
  topic?: string
  /** Banner title, e.g. "Teaching: Variations". */
  title: string
  startedAt: number
  steps: number
  stepBudget: number
  /** Exact command ids, or prefixes ending in ".", the guard accepts. */
  allowed: readonly string[]
  /** Index into guard.QUALITY_ORDER when the session started. */
  qualityRankAtStart: number
}

export type PilotEnded = {
  phase: 'ended'
  mode: PilotMode
  topic?: string
  reason: PilotEndReason
  title: string
  summary?: string
  sessionName?: string
  /**
   * Did the take reach the library? `undefined` while the write is still in
   * flight, and for a take that was never saved. The pilot leaves `driving`
   * the moment the recorder stops (so no tool call can slip through the
   * guard unrecorded), which is before the write settles — hence a second
   * field rather than a value baked into `endPilot`.
   */
  saved?: boolean
  steps: number
  durationMs: number
}

export type PilotState = { phase: 'idle' } | PilotDriving | PilotEnded

export const MAX_PILOT_LOG = 50

const [pilot, setPilot] = createSignal<PilotState>({ phase: 'idle' })
const [pilotLog, setPilotLog] = createSignal<PilotLogEntry[]>([])
const [lastPilotSession, setLastPilotSession] = createSignal<
  RecordedSession | undefined
>()

export { pilot, pilotLog, lastPilotSession }

export const agentDriving = (): boolean => pilot().phase === 'driving'

export function drivingState(): PilotDriving | undefined {
  const state = pilot()
  return state.phase === 'driving' ? state : undefined
}

export function appendPilotLog(kind: PilotLogKind, text: string): void {
  setPilotLog((log) => [
    ...log.slice(-(MAX_PILOT_LOG - 1)),
    { t: Date.now(), kind, text },
  ])
}

export function startPilot(
  input: Omit<PilotDriving, 'phase' | 'startedAt' | 'steps'> & { now?: number },
): { ok: true } | { ok: false; error: string } {
  if (pilot().phase === 'driving') {
    return {
      ok: false,
      error: 'An Arcade session is already active. Finish or stop it first.',
    }
  }
  setPilotLog([])
  setLastPilotSession(undefined)
  setPilot({
    phase: 'driving',
    mode: input.mode,
    topic: input.topic,
    title: input.title,
    startedAt: input.now ?? globalThis.performance.now(),
    steps: 0,
    stepBudget: input.stepBudget,
    allowed: input.allowed,
    qualityRankAtStart: input.qualityRankAtStart,
  })
  appendPilotLog('system', `${input.title} started`)
  return { ok: true }
}

/** Count one step. Returns the remaining budget, or -1 when nothing counted. */
export function notePilotStep(
  kind: 'command' | 'narrate',
  text: string,
): number {
  const state = pilot()
  if (state.phase !== 'driving' || state.steps >= state.stepBudget) return -1
  setPilot({ ...state, steps: state.steps + 1 })
  appendPilotLog(kind, text)
  return state.stepBudget - (state.steps + 1)
}

export function pilotStepsRemaining(): number {
  const state = drivingState()
  return state ? Math.max(0, state.stepBudget - state.steps) : 0
}

export function pilotElapsedMs(now = globalThis.performance.now()): number {
  const state = drivingState()
  return state ? Math.max(0, now - state.startedAt) : 0
}

export function endPilot(
  reason: PilotEndReason,
  extras: {
    title?: string
    summary?: string
    sessionName?: string
    session?: RecordedSession
    now?: number
  },
): PilotEnded | undefined {
  const state = pilot()
  if (state.phase !== 'driving') return undefined
  const ended: PilotEnded = {
    phase: 'ended',
    mode: state.mode,
    topic: state.topic,
    reason,
    title: extras.title ?? state.title,
    summary: extras.summary,
    sessionName: extras.sessionName,
    steps: state.steps,
    durationMs: Math.max(
      0,
      (extras.now ?? globalThis.performance.now()) - state.startedAt,
    ),
  }
  setLastPilotSession(extras.session)
  setPilot(ended)
  appendPilotLog('system', `${ended.title}: ${reason}`)
  return ended
}

/** Record how the library write went, once it settles. */
export function notePilotSaveResult(saved: boolean): void {
  const state = pilot()
  if (state.phase !== 'ended') return
  setPilot({ ...state, saved })
}

export function resetPilot(): void {
  setPilot({ phase: 'idle' })
  clearPilotFocus()
  setPilotLog([])
  setLastPilotSession(undefined)
}
