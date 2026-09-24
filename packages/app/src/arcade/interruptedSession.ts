// An Arcade session a page reload cut short, remembered so the agent is told instead of editing the viewer's flame.
import { createSignal } from 'solid-js'

/**
 * The pilot's state is module signals, so a reload drops a running session
 * without a trace: `arcade_status` said `idle`, the take was never saved, and
 * the agent's next `get_flame` or `execute_command` read and wrote the
 * viewer's own flame while the agent still believed it was playing its seat.
 *
 * So a running session leaves a marker in `sessionStorage` (per tab, and it
 * survives a reload), and a clean ending removes it. A marker found when the
 * page loads is a session the reload ended, unless another live tab claims it:
 * Duplicate Tab copies `sessionStorage`, and the tab it was copied from is
 * asked over a BroadcastChannel. Until the agent acknowledges the
 * interruption with `arcade_status`, or starts a new session, every other
 * tool refuses with `interruptionMessage` rather than act on the viewer's
 * flame. The viewer is told once, on the first page after the reload.
 */
export type InterruptedSession = {
  /** The pilot mode: `teach`, `cinema`, `duel` or `beats`. */
  mode: string
  /** The session's title as the pilot knew it, e.g. "Duelling you". */
  title: string
}

const ARCADE_SESSION_KEY = 'chaos-master:arcade-session'
const CHANNEL_NAME = 'chaos-master:arcade-session'

/**
 * How long a page with a marker waits for another tab to claim the session.
 * A same-origin BroadcastChannel answers within a few milliseconds; the rest
 * is headroom for a busy main thread in the tab that answers.
 */
const CLAIM_WINDOW_MS = 300

/** What a running session keeps in `sessionStorage`. */
type Marker = InterruptedSession & {
  /** Tells this session from a copy of it in a duplicated tab. */
  id: string
  /** The viewer has been told about the interruption; do not say it again. */
  announced?: boolean
}

type ChannelMessage = { type: 'claim?' | 'claimed'; id: string }

function sessionStore(): Storage | undefined {
  try {
    return globalThis.sessionStorage
  } catch {
    // Blocked storage (sandboxed frames, some privacy modes) throws on access.
    return undefined
  }
}

// This document's own storage, bound once: a duplicated tab starts from a copy
// of it and then has its own.
const store = sessionStore()

function readMarker(): Marker | undefined {
  try {
    const raw = store?.getItem(ARCADE_SESSION_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Partial<Marker>
    if (
      typeof parsed.mode !== 'string' ||
      typeof parsed.title !== 'string' ||
      typeof parsed.id !== 'string'
    ) {
      return undefined
    }
    return {
      mode: parsed.mode,
      title: parsed.title,
      id: parsed.id,
      announced: parsed.announced === true,
    }
  } catch {
    return undefined
  }
}

function writeMarker(marker: Marker): void {
  try {
    store?.setItem(ARCADE_SESSION_KEY, JSON.stringify(marker))
  } catch {
    // Without storage a reload cannot be detected; the session still runs.
  }
}

function removeMarker(): void {
  try {
    store?.removeItem(ARCADE_SESSION_KEY)
  } catch {
    // Nothing to clean up where storage is unavailable.
  }
}

const [interrupted, setInterrupted] = createSignal<
  InterruptedSession | undefined
>()
const [announcement, setAnnouncement] = createSignal<string | undefined>()

/** The session the last reload ended, until the agent acknowledges it. */
export const interruptedSession = interrupted

/**
 * What the viewer is told about it, once per interruption: set on the first
 * page after the reload that ended it, and never on a later one.
 */
export const interruptionAnnouncement = announcement

/** The id of the session this page is running, if one is. */
let runningId: string | undefined

/**
 * Every marker id this document wrote, running or ended. A duplicated tab
 * asks about the id it copied, and the answer has to hold even when this
 * page's session ended between the duplication and the copy's boot: the copy
 * must then drop the marker quietly, not report a reload that never happened.
 */
const writtenIds = new Set<string>()

let channel: BroadcastChannel | undefined

/**
 * A BroadcastChannel, or none where the constructor throws: Firefox throws
 * SecurityError when storage access is denied. Without one a copied marker
 * cannot be told from a reload, the same as in a browser that has no
 * BroadcastChannel at all.
 */
function createChannel(): BroadcastChannel | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined
  try {
    return new BroadcastChannel(CHANNEL_NAME)
  } catch {
    return undefined
  }
}

function openChannel(): void {
  if (channel) return
  channel = createChannel()
  if (!channel) return
  channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
    const message = event.data
    if (message.type === 'claim?' && writtenIds.has(message.id)) {
      channel?.postMessage({ type: 'claimed', id: message.id })
    }
  }
}

function closeChannel(): void {
  channel?.close()
  channel = undefined
}

// A reloading document stops answering before the new one asks; a page kept
// in the back-forward cache answers again when it is shown.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', closeChannel)
  window.addEventListener('pageshow', openChannel)
}
openChannel()

/**
 * Whether a live tab wrote the marker with this id. Only the tab this one was
 * duplicated from can have: it is the one way a second document gets this
 * tab's storage. A reloaded document has closed its channel by then, so a
 * real reload gets no answer.
 *
 * An answer later than the window counts as none, and the copy then reports
 * an interruption that did not happen. That needs the original's main thread
 * blocked for the whole window; waiting longer would delay every reloaded
 * page's first tool call by the same amount, so the window stays as it is.
 */
function claimedElsewhere(id: string): Promise<boolean> {
  const ask = createChannel()
  if (!ask) return Promise.resolve(false)
  return new Promise((resolve) => {
    const done = (claimed: boolean) => {
      clearTimeout(timer)
      ask.close()
      resolve(claimed)
    }
    const timer = setTimeout(() => {
      done(false)
    }, CLAIM_WINDOW_MS)
    ask.onmessage = (event: MessageEvent<ChannelMessage>) => {
      if (event.data.type === 'claimed' && event.data.id === id) done(true)
    }
    ask.postMessage({ type: 'claim?', id })
  })
}

/**
 * Settles what the marker a previous document left means. The marker is read
 * once, when this module loads: in a fresh page that is before any session
 * can have started, so a marker here is a session a reload ended, or one a
 * duplicated tab copied from the tab that wrote it.
 */
async function checkMarker(marker: Marker | undefined): Promise<void> {
  if (!marker) return
  // Asked once the current task is over, so the window starts after the rest
  // of the app's modules have evaluated rather than running down during it.
  await new Promise((resolve) => setTimeout(resolve, 0))
  if (await claimedElsewhere(marker.id)) {
    // A duplicate: the session is the other tab's, and this copy of its
    // marker would report a false interruption on this tab's next reload.
    // A session started here meanwhile wrote its own marker; keep that one.
    if (readMarker()?.id === marker.id) removeMarker()
    return
  }
  // A session started here while the check ran supersedes the old one.
  if (runningId !== undefined) return
  setInterrupted({ mode: marker.mode, title: marker.title })
  if (!marker.announced) {
    setAnnouncement(interruptionNotice(marker))
    writeMarker({ ...marker, announced: true })
  }
}

// Read now, before a session this page starts can overwrite it.
const checked = checkMarker(readMarker())

/** Resolves once the marker is settled. The tools wait for it, once. */
export function interruptionChecked(): Promise<void> {
  return checked
}

/** A session started: remember it, and let it supersede any interrupted one. */
export function markSessionRunning(session: InterruptedSession): void {
  setInterrupted(undefined)
  runningId =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  writtenIds.add(runningId)
  writeMarker({ ...session, id: runningId })
}

/** A session ended through the app: nothing was interrupted. */
export function markSessionClosed(): void {
  runningId = undefined
  removeMarker()
}

/**
 * The agent has been told: release the tools and forget the marker. Only an
 * interruption is acknowledged; a status read during a running session must
 * leave that session's marker alone, or a reload after it goes unnoticed.
 */
export function acknowledgeInterruption(): InterruptedSession | undefined {
  const session = interrupted()
  if (!session) return undefined
  setInterrupted(undefined)
  removeMarker()
  return session
}

const START_TOOL: Record<string, string> = {
  teach: 'arcade_start_lesson',
  cinema: 'arcade_start_cinema',
  duel: 'arcade_start_duel',
  beats: 'arcade_start_beats',
}

const MODE_NAME: Record<string, string> = {
  teach: 'lesson',
  cinema: 'cinema session',
  duel: 'duel',
  beats: 'beats session',
}

/** What the agent is told, in place of a tool's answer, until it acknowledges. */
export function interruptionMessage(session: InterruptedSession): string {
  const kind = MODE_NAME[session.mode] ?? 'session'
  const start = START_TOOL[session.mode]
  const again = start ? ` To play again, call ${start}.` : ''
  return (
    [
      `The Arcade ${kind} "${session.title}" was ended by a page reload, and no Arcade session is active.`,
      'Its recording was not saved.',
      "Other tools would now act on the viewer's own flame, so they are held until you call arcade_status, which acknowledges this.",
    ].join(' ') + again
  )
}

/** The viewer's half of the same news, for the launch toast. */
export function interruptionNotice(session: InterruptedSession): string {
  const kind = MODE_NAME[session.mode] ?? 'session'
  return `The reload ended the agent's ${kind}. Its recording was not saved.`
}
