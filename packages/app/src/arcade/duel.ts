import { createSignal } from 'solid-js'
import { recorderStream } from '@/recorder/recorder'
import { createSeat } from '@/seats/seat'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { SessionRecordingStartResult } from '@/recorder/recorder'
import type { RecordedSession } from '@/recorder/schema'
import type { Seat } from '@/seats/seat'

/**
 * A duel, as one module-global state — the same shape as `arcade/pilot.ts`,
 * and for the same reason: the tools that start it, the stage that renders it
 * and the clock that ends it all read it, and none of them owns it.
 *
 * The rival seat is created here rather than in the component tree because a
 * WebMCP tool starts the duel, and a tool has no component to mount into.
 */
export type DuelRecording = 'both' | 'rival' | 'player' | 'none'

/**
 * What the agent said when it declared itself happy. It cannot end the duel —
 * only the viewer or the clock can — so this is how it still gets to name its
 * own work: `finishDuel` falls back to this title.
 */
export type DuelReady = { title?: string; summary?: string; at: number }

export type DuelState =
  | { phase: 'idle' }
  | {
      phase: 'running'
      rival: Seat
      endsAt: number
      durationMs: number
      recording: DuelRecording
      ready?: DuelReady
    }

const [duel, setDuel] = createSignal<DuelState>({ phase: 'idle' })

/**
 * Module-scoped rather than part of the state, so that `setDuel` stays a plain
 * value swap and nothing can accidentally clone a live handle into a new state.
 */
let expiryTimer: ReturnType<typeof globalThis.setTimeout> | undefined

export { duel }

export const duelActive = (): boolean => duel().phase === 'running'

/**
 * Whether the viewer has asked for the real sidebar.
 *
 * Off by default, and reset with every duel: the brief settled on a clean
 * two-canvas read, and the sidebar is the escape hatch for when you know
 * exactly which parameter you want. It lives here rather than in the stage
 * because the workspace has to raise the sidebar over the stage's overlay,
 * and the stage has to step aside for it — two components, one fact.
 */
const [duelSidebarOpen, setDuelSidebarOpen] = createSignal(false)

export { duelSidebarOpen, setDuelSidebarOpen }

export function runningDuel():
  | Extract<DuelState, { phase: 'running' }>
  | undefined {
  const state = duel()
  return state.phase === 'running' ? state : undefined
}

/**
 * The one place a typed or tool-supplied clock is made sense of. Anything
 * unreadable falls back to the default rather than to zero, which would be a
 * duel that is over before it starts.
 */
export function clampDuelSeconds(value: unknown): number {
  const seconds =
    typeof value === 'string' ? Number(value.trim() || Number.NaN) : value
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return DEFAULT_DUEL_SECONDS
  }
  return Math.min(
    MAX_DUEL_SECONDS,
    Math.max(MIN_DUEL_SECONDS, Math.round(seconds)),
  )
}

export const MIN_DUEL_SECONDS = 60
export const MAX_DUEL_SECONDS = 600
export const DEFAULT_DUEL_SECONDS = 180

function recordsPlayer(recording: DuelRecording): boolean {
  return recording === 'both' || recording === 'player'
}

function recordsRival(recording: DuelRecording): boolean {
  return recording === 'both' || recording === 'rival'
}

/**
 * Start both sides in one synchronous call.
 *
 * Both streams take the same time origin, so the two logs share a zero and a
 * later combined replay can interleave them without guessing. If the second
 * start fails the first is cancelled: a duel with one recorded side would be
 * a half-take nobody asked for.
 */
export function startDuel(input: {
  rivalFlame: FlameDescriptor
  playerFlame: FlameDescriptor
  durationMs: number
  recording: DuelRecording
  now?: number
  /**
   * Called once when the clock reaches zero. It is scheduled here rather than
   * from the stage, because every modal in this app opens with
   * `dialog.showModal()`, which makes the rest of the document inert — a
   * component-owned timer would keep counting behind a dialog nobody can
   * dismiss from a stage that can no longer be clicked.
   */
  onExpire?: () => void
  /**
   * How to start the viewer's own stream. The workspace passes its recorder
   * facade, which snapshots the timeline, audio, sonification and view state
   * and pauses a playing timeline first. Without it the viewer's duel take is
   * the only take in the app that begins with no starting state.
   */
  startPlayer?: (now: number) => SessionRecordingStartResult
}): { ok: true; rival: Seat } | { ok: false; error: string } {
  if (duelActive()) {
    return { ok: false, error: 'A duel is already running.' }
  }
  const now = input.now ?? globalThis.performance.now()
  const player = recorderStream('player')
  const rival = recorderStream('rival')
  if (recordsPlayer(input.recording)) {
    const started =
      input.startPlayer?.(now) ?? player.start(input.playerFlame, {}, now)
    if (!started.ok) {
      return {
        ok: false,
        error: `Could not record your side: ${started.reason}`,
      }
    }
  }
  if (recordsRival(input.recording)) {
    const started = rival.start(input.rivalFlame, {}, now)
    if (!started.ok) {
      if (recordsPlayer(input.recording)) player.cancel()
      return {
        ok: false,
        error: `Could not record the AI's side: ${started.reason}`,
      }
    }
  }
  setDuelSidebarOpen(false)
  const seat = createSeat('rival', input.rivalFlame)
  if (input.onExpire) {
    const onExpire = input.onExpire
    expiryTimer = globalThis.setTimeout(() => {
      expiryTimer = undefined
      onExpire()
    }, input.durationMs)
  }
  setDuel({
    phase: 'running',
    rival: seat,
    endsAt: now + input.durationMs,
    durationMs: input.durationMs,
    recording: input.recording,
  })
  return { ok: true, rival: seat }
}

/**
 * The agent declaring itself happy. Deliberately not an ending: it records a
 * title and lets the duel run on, so the agent can keep polishing until the
 * clock or the viewer calls it.
 */
export function markDuelReady(note: {
  title?: string
  summary?: string
  now?: number
}): boolean {
  const state = runningDuel()
  if (!state) return false
  setDuel({
    ...state,
    ready: {
      title: note.title?.trim().slice(0, 80) || undefined,
      summary: note.summary?.trim().slice(0, 400) || undefined,
      at: note.now ?? globalThis.performance.now(),
    },
  })
  return true
}

export const duelReady = (): DuelReady | undefined => runningDuel()?.ready

/** Stop both sides in one synchronous call and dispose the rival seat. */
export function stopDuel(): {
  player?: RecordedSession
  rival?: RecordedSession
} {
  const state = runningDuel()
  if (!state) return {}
  if (expiryTimer !== undefined) {
    globalThis.clearTimeout(expiryTimer)
    expiryTimer = undefined
  }
  // Only the sides this duel started. Reading `isRecording()` alone stopped
  // whatever the viewer happened to be recording already and filed it as a
  // duel take.
  const playerSession =
    recordsPlayer(state.recording) && recorderStream('player').isRecording()
      ? recorderStream('player').stop()
      : undefined
  const rivalSession =
    recordsRival(state.recording) && recorderStream('rival').isRecording()
      ? recorderStream('rival').stop()
      : undefined
  setDuel({ phase: 'idle' })
  setDuelSidebarOpen(false)
  // After the sessions are taken: disposing cancels the stream, which would
  // throw away the take if it ran first.
  state.rival.dispose()
  return { player: playerSession, rival: rivalSession }
}

/** Milliseconds left on the clock, never negative. */
export function duelRemainingMs(
  now: number = globalThis.performance.now(),
): number {
  const state = runningDuel()
  return state ? Math.max(0, state.endsAt - now) : 0
}
