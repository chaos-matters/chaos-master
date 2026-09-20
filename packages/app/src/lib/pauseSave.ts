import { deepClone } from '@/utils/clone'
import { parseFlameEnvelope } from '@/utils/flameImport'
import { loadRecentFlame, newRecentFlameId, upsertRecentFlame, } from '@/utils/recentFlames'
import { safeGetItem, safeRemoveItem, safeSetItem } from '@/utils/storage'
import { onAppPause } from './lifecycle'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { PauseSaveReport } from '@/hooks/useWorkspaceAutosave'
import type { TimelineConfig, TimelineTrack } from '@/utils/timeline'

/**
 * The save the native app makes on its way to the background.
 *
 * The editor's own autosave reaches Recents on pagehide and at every load
 * boundary (hooks/useWorkspaceAutosave.ts) - but a WebView the OS force-stops
 * never fires pagehide, and both platforms force-stop without warning. Pause
 * is the last moment a native app is told about, so the open document is
 * written then too.
 *
 * It is written to RECENTS, through the same writer every other save uses.
 * There used to be a slot of its own here - one flame, under one key, rescued
 * into Recents by the next cold start and handed back to the workspace - and
 * the work then had to survive the rescue, the seeding, the welcome screen and
 * whatever the user opened next. Each of those steps lost it at least once.
 * Writing where every other write lands leaves no restore ceremony to get
 * wrong: the flame is on the shelf from the moment the app is backgrounded,
 * and the next launch is an ordinary launch.
 *
 * What the slot could do and Recents cannot is report a refusal. A toast
 * raised as the process ends is never read, so a pause that could not save
 * says so at the NEXT launch instead - see {@link takePauseSaveFailure}.
 *
 * The other thing the slot did is put the user back where they were, and that
 * is kept too - as a pointer rather than a copy. The write records which
 * Recents entry it made, and a cold start opens that entry
 * ({@link reopenTarget}). Everything the old restore had to get right is gone
 * with the second store: the work is already on the shelf before the app
 * comes back, so a pointer that names nothing costs nothing.
 */

/** The single-slot crash copy of a build before the fold. Read once on launch
 *  and retired - see {@link migrateLegacyDraft}. Nothing writes it any more. */
export const LEGACY_DRAFT_KEY = 'chaos-master-draft'

/** Set when a pause could not save, cleared when one does or when a launch
 *  has said so. A few bytes on purpose: the write that just failed was the
 *  whole flame list, and this can still land where a quota refused that. */
const PAUSE_FAILED_KEY = 'chaos-master-pause-save-failed'

/**
 * The Recents entry the last pause write landed in, so a launch can reopen it.
 *
 * An id, never a flame. The flame is in Recents - that is the whole dividend
 * of writing there - so this holds the one thing the next launch cannot work
 * out for itself, and if it is wrong, stale or gone the user has lost nothing.
 *
 * Not cleared when it is read. A pause writes only a dirty document, so the
 * launch after a session that changed nothing would have nothing to point at,
 * and reading-to-consume would drop the user back on the starter flame after
 * their second force-stop in a row.
 */
const REOPEN_KEY = 'chaos-master-reopen'

/**
 * The kept flame a forced pause write replaced, until a launch has said so.
 *
 * A name, not an entry: the flame itself is gone, and what is owed the user is
 * being told which one it was. Carried exactly as a refusal is, and for the
 * same reason - there is no reader at pause time.
 */
const PAUSE_EVICTED_KEY = 'chaos-master-pause-save-evicted'

/**
 * The open document's writer, as the workspace last installed it.
 *
 * One slot rather than a set: a workspace that mounts again replaces the one
 * before it, and two writers for one document would file the same work twice.
 */
let saveOpenDocument: (() => PauseSaveReport) | undefined
/** Whether the pause subscription exists. Taken once and never given back. */
let subscribed = false

/** Carry a pause that did not save to the next launch, and take back a
 *  complaint the session has since made good. */
function recordOutcome(report: PauseSaveReport): void {
  const { outcome } = report
  // Where the work went, for the launch that has to put it back on screen.
  // Only ever written next to a write that landed, and left alone otherwise:
  // a clean pause means the user is still on the document the last write
  // named, so the pointer standing is the pointer being right.
  if (report.entryId !== undefined) safeSetItem(REOPEN_KEY, report.entryId)
  // What the write cost. At the cap, with work that existed nowhere else and
  // a process that may be ending, forcing past the guard is the smaller loss
  // - but it deleted a flame the user chose to keep, and the app deciding
  // that on its own is exactly the kind of thing that may not go unnoticed.
  if (report.evicted !== undefined) {
    safeSetItem(PAUSE_EVICTED_KEY, report.evicted)
  }
  // Nothing to say: either the document was already on the shelf, or it is
  // there now.
  if (outcome === 'clean') return
  if (outcome === 'saved') {
    // An earlier pause in this session could not save and this one did, so
    // the work is on the shelf and a launch that still complained would be
    // crying wolf about work the user has.
    safeRemoveItem(PAUSE_FAILED_KEY)
    return
  }
  if (!safeSetItem(PAUSE_FAILED_KEY, '1')) {
    // Storage refusing the flame and then refusing three bytes is a device
    // with nothing left at all. There is nowhere to leave a message for the
    // user, so leave one where a developer can find it.
    console.warn(
      '[pause] the open flame was not saved, and saying so failed too',
    )
  }
}

/**
 * Wire the pause write to the open document.
 *
 * There is no disposer, and that is the point. The workspace installs this
 * from its component body, and an ErrorBoundary catch (App.tsx) or a WebGPU
 * degrade unmounts the workspace - an `onCleanup` here would take the crash
 * net down with the editor and leave the process saving nothing, at exactly
 * the moment there is unsaved work and no editor left to write it. The reader
 * keeps working after its owner is disposed: it reads an unwrapped store and
 * plain signals, and disposing an owner empties neither.
 *
 * Native only. On the web pause is `visibilitychange`, which fires on every
 * tab switch, and a tab gets its pagehide - it is not force-stopped from under
 * the user.
 */
export function installPauseSave(input: {
  native: boolean
  /** Save the open document if it holds anything unsaved, and say what
   *  happened and where (hooks/useWorkspaceAutosave.ts). */
  save: () => PauseSaveReport
}): void {
  if (!input.native) return
  saveOpenDocument = input.save
  if (subscribed) return
  subscribed = true
  onAppPause(() => {
    const save = saveOpenDocument
    if (save) recordOutcome(save())
  })
}

/** Test seam: forget the installed writer, so one test's workspace cannot
 *  write on the next test's pause. Nothing in the app calls this - the
 *  subscription is meant to outlive every unmount. */
export function stopPauseSave(): void {
  saveOpenDocument = undefined
}

/**
 * Whether the last pause could not save the open document.
 *
 * Said once: reading it clears the flag. The alternative to carrying it here
 * is a toast at pause time, which is raised as the process is being torn down
 * and never reaches a reader - and a save that silently did not happen is the
 * one outcome a user cannot find out about any other way.
 */
export function takePauseSaveFailure(): boolean {
  if (safeGetItem(PAUSE_FAILED_KEY) === null) return false
  safeRemoveItem(PAUSE_FAILED_KEY)
  return true
}

/**
 * The kept flame the last pause write had to replace, if it replaced one.
 *
 * Said once: reading it clears the record. Same shape as
 * {@link takePauseSaveFailure}, because it answers the same question at the
 * same moment - what happened while nobody was there to be told.
 */
export function takePauseSaveEviction(): string | undefined {
  const name = safeGetItem(PAUSE_EVICTED_KEY)
  if (name === null) return undefined
  safeRemoveItem(PAUSE_EVICTED_KEY)
  return name
}

/** The document a launch puts back on screen, read out of Recents exactly as
 *  the Library would read it. */
export interface ReopenedFlame {
  readonly flame: FlameDescriptor
  readonly tracks?: TimelineTrack[]
  readonly config?: TimelineConfig
}

/**
 * The flame to reopen on a native cold start, if it is still there.
 *
 * A convenience laid over durable data, and deliberately nothing more. The
 * pause write put the work in Recents before the app went away, so this only
 * decides what is on screen when it comes back - "preserved" is settled
 * before this runs, and only "loaded" is left. That is why every way it can
 * fail is silent: a pointer to an entry the user deleted, or one that fell
 * off the end of the list, means the app opens whatever it would have opened
 * anyway.
 *
 * It holds no seat, either. The old restore had to outrank a welcome-screen
 * tap, because the tap overwrote the only copy of the work on its way to the
 * editor; now a tap that gets there first simply wins, and the flame this
 * would have opened is in the Library where the user left it.
 *
 * Native only, like the write that fills the pointer: a browser tab gets its
 * pagehide and is not force-stopped from under the user.
 */
export function reopenTarget(native: boolean): ReopenedFlame | undefined {
  if (!native) return undefined
  const id = safeGetItem(REOPEN_KEY)
  if (id === null) return undefined
  const entry = loadRecentFlame(id)
  if (entry === undefined) return undefined
  // Cloned on the way out: Recents hands every caller a shared, read-only
  // record (utils/recentFlames.ts), and this one is going into a store the
  // editor writes to.
  return {
    flame: deepClone(entry.flame),
    ...(entry.tracks ? { tracks: deepClone(entry.tracks) } : {}),
    ...(entry.config ? { config: deepClone(entry.config) } : {}),
  }
}

/**
 * Move a pre-fold crash copy onto the shelf, once.
 *
 * An upgrade must not cost the work the old build was holding: it wrote the
 * flame it had open into a slot of its own, and after the fold nothing reads
 * that slot. So the launch puts it in Recents, where the Library shows it, and
 * only then forgets the key.
 *
 * ORDER IS THE WHOLE OF IT: the key goes only after a write that landed. At
 * the cap, and when storage refuses, the slot is still the only copy of that
 * work, so it stays exactly where it is and the next launch tries again - the
 * user freeing one place in Library is what finishes the migration.
 *
 * A fresh id, never the session id the envelope carries. That id may name an
 * entry the old build's autosave wrote AFTER this copy - the two are halves of
 * one session's work - and writing this over it would destroy the newer half.
 * The cost of a fresh id is one duplicate entry on the launch after an
 * upgrade, which the user can delete; the cost of reusing the id is work that
 * cannot be got back.
 *
 * Not gated on the platform. Only a native build ever wrote the key, so on the
 * web this is one lookup that finds nothing - cheaper than a flag that has to
 * stay right.
 */
export function migrateLegacyDraft(): void {
  const raw = safeGetItem(LEGACY_DRAFT_KEY)
  if (raw === null) return
  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    // A half-written value: the OS killed the old build in the middle of the
    // write. There is nothing in it to move, and it is left alone rather than
    // deleted - deleting what has not been written somewhere else is the one
    // thing this module never does, and utils/storageUsage.ts keeps the key
    // out of "Clear settings" for the same reason.
    return
  }
  // The same reader an imported file goes through, so a flame written by a
  // build that no longer validates is dropped rather than moved in
  // half-formed.
  const draft = parseFlameEnvelope(stored)
  if (draft === undefined) return
  const outcome = upsertRecentFlame(
    newRecentFlameId(),
    draft.flame,
    undefined,
    draft.tracks,
    draft.config,
  )
  if (outcome === 'saved') safeRemoveItem(LEGACY_DRAFT_KEY)
}
