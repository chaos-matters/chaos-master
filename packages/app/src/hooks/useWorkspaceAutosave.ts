import { onCleanup } from 'solid-js'
import { useOptionalToast } from '@/contexts/ToastContext'
import { autosaveIntervalMin, autosaveRecents } from '@/utils/autosaveSettings'
import { getOldestRecentFlame, MAX_RECENT_FLAMES, saveRecentFlame, upsertRecentFlame, } from '@/utils/recentFlames'
import { createAutosaveQuestion } from './autosaveQuestion'
import { createSaveReminder } from './saveReminder'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { FlushOutcome } from '@/lib/documentLoad'
import type { RecentWriteOutcome } from '@/utils/recentFlames'
import type { TimelineConfig, TimelineTrack } from '@/utils/timeline'

/**
 * What one pause write did.
 *
 * More than the outcome, because the launch after a force-stop is the only
 * reader this write ever gets: a toast raised as the process ends is never
 * seen, so everything the next launch has to act on leaves here
 * (lib/pauseSave.ts).
 */
export interface PauseSaveReport {
  outcome: FlushOutcome
  /**
   * The Recents entry the write landed in - the one a cold start reopens, so
   * a force-stop does not cost the user their place. Set only on 'saved':
   * there is nothing to point at otherwise.
   */
  entryId?: string
  /**
   * The name of the kept flame this write pushed off the end of the list, on
   * the one path allowed to do that without asking. Set only when a flame was
   * actually replaced, because the next launch says so by name and a claim
   * that something was deleted had better be true.
   */
  evicted?: string
}

export interface UseWorkspaceAutosaveParams {
  flameDescriptor: FlameDescriptor
  /**
   * The document as every save here stores it: the workspace passes its own
   * without the gallery's silent hover preview (useWorkspaceBlendPick), which
   * otherwise put a partner nobody picked into Recents.
   */
  savedFlame?: () => FlameDescriptor
  getTracks: () => TimelineTrack[] | undefined
  /**
   * The timeline the flame is being edited at. Part of the document, not of
   * the tracks: the frame rate, the speed, the end frame and the loop mode
   * live in their own signal, so a snapshot of the flame and its keyframes
   * alone reported a workspace with a changed frame rate as holding nothing
   * unsaved - nothing written on pause, no flush at a load boundary, and the
   * change died with the process.
   */
  getConfig: () => TimelineConfig | undefined
  agentDriving: () => boolean
  /**
   * @returns the toast's id, or -1 when nothing was shown - the store is
   * muted while an Arcade pilot drives (contexts/ToastContext.tsx). The
   * answer is load-bearing here: the notices below are said once per run, and
   * spending that one shot on a toast nobody saw would silence it for the
   * rest of the session.
   */
  showToast: (
    message: string,
    duration?: number | 'sticky',
    actions?: Array<{ label: string; onClick: () => void }>,
  ) => number
  /**
   * Put "Recents is full - may this replace the oldest flame?" to the user
   * and resolve with their answer.
   *
   * Taken as a parameter rather than reached for, because only two callers
   * here are ever allowed to ask: the user's own Save for Later, and the
   * flush at a document replacement, which is the last moment the open
   * document's work exists anywhere. The interval autosave and the two
   * writers for a process that is ending - the pagehide flush and the pause
   * save - all have answers of their own (below), and none of them may raise
   * this.
   */
  confirmOverwriteOldest: () => Promise<boolean>
  /**
   * Put "storage refused to save the open flame - open the other one
   * anyway?" to the user and resolve with their answer.
   *
   * A different question from the one above, and so a different prompt: at
   * the cap something of the user's gives way whichever answer they give and
   * they choose which, while a refusal offers nothing to trade - the work
   * cannot be stored at all, and the only thing left to decide is whether to
   * walk away from it. Answering no keeps it, so no is the default.
   */
  confirmDiscardUnsaved: () => Promise<boolean>
  /**
   * Take a toast down by the id `showToast` returned. Defaults to the
   * ToastProvider's own, which is where MainWorkspace's `showToast` comes
   * from; tests that stand in for the store pass theirs.
   */
  dismissToast?: (id: number) => void
}

export function useWorkspaceAutosave(params: UseWorkspaceAutosaveParams) {
  const {
    flameDescriptor,
    savedFlame = () => flameDescriptor,
    getTracks,
    getConfig,
    agentDriving,
    showToast,
    confirmOverwriteOldest,
    confirmDiscardUnsaved,
  } = params
  const dismissToast =
    params.dismissToast ?? useOptionalToast()?.dismissToast ?? (() => {})

  const newAutosaveId = () =>
    `autosave-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  /**
   * The entry this session owns: one editing session, one place on the shelf,
   * rather than a new entry per write. A fresh one at every load boundary -
   * the document that opens there is not the document that left.
   */
  let autosaveSessionId = newAutosaveId()
  /** Said once each. Neither a full shelf nor a storage that says no fixes
   *  itself mid-session, and both are spent only on a toast that was shown. */
  let fullNoticeShown = false
  let refusedNoticeShown = false
  const autosaveSnapshot = () =>
    JSON.stringify({
      flame: savedFlame(),
      tracks: getTracks(),
      config: getConfig(),
    })
  let autosaveBaseline = autosaveSnapshot()
  let editingSince: number | null = null
  let lastAutosaveAt = 0

  const isFlameDirty = () => autosaveSnapshot() !== autosaveBaseline
  const markSavedBaseline = () => {
    autosaveBaseline = autosaveSnapshot()
  }
  /**
   * A different document is on screen: re-take the baseline, and start a
   * Recents entry of its own for it.
   *
   * A boundary ALWAYS starts a new entry. It used to start one only when the
   * incoming flame differed from the last one, which quietly kept the entry
   * across "open F, edit, open F again from Library": the flush wrote the
   * edits into that entry, the boundary kept it, and the next autosave of the
   * fresh copy replaced them - under the same name, so nothing looked wrong.
   *
   * A single hand-off crosses this boundary twice, because the flame lands in
   * one effect and its animation in another. That costs an id and nothing
   * else: only the last one is ever written to, and the document is clean at
   * both halves.
   */
  const markLoadedBaseline = () => {
    autosaveBaseline = autosaveSnapshot()
    editingSince = null
    autosaveSessionId = newAutosaveId()
  }

  /**
   * One write of the open document into this session's Recents entry.
   *
   * `force` is what gets a write past the guard that stops an automatic save
   * from deleting a flame the user kept (utils/recentFlames.ts), so it is
   * never a default and never a convenience: the three callers that pass true
   * all have a reason the guard was written for - a user who answered the
   * question, and the two writers for a process that is about to end.
   */
  const writeToRecents = (force: boolean): RecentWriteOutcome => {
    const outcome = upsertRecentFlame(
      autosaveSessionId,
      savedFlame(),
      undefined,
      getTracks(),
      getConfig(),
      force,
    )
    if (outcome === 'saved') {
      lastAutosaveAt = Date.now()
      markSavedBaseline()
    }
    return outcome
  }

  /** Declining is right - the alternative is deleting a flame the user kept -
   *  but declining in silence is the app quietly not saving. Said once: a
   *  full shelf does not empty itself mid-session. */
  const noticeFull = () => {
    if (fullNoticeShown) return
    // Long enough to read and act on. Asking for 'sticky' would have been
    // quietly downgraded to the four-second default, because a sticky toast
    // with nothing to answer it with cannot be dismissed and the toast store
    // refuses to strand one (contexts/ToastContext).
    const shown = showToast(
      `Recents is full (${MAX_RECENT_FLAMES} flames), so this one was not auto-saved. Delete one in Library, or use Save for Later to replace the oldest.`,
      12000,
    )
    // Spent only on a toast that reached the screen. The store is muted while
    // an Arcade pilot drives and returns -1 having shown nothing, so setting
    // the flag first meant the one notice a run gets could be swallowed by a
    // lesson and never said again (contexts/ToastContext.tsx).
    if (shown !== -1) fullNoticeShown = true
  }

  /**
   * Storage said no: a quota, a private window, a locked-down WebView.
   *
   * Nothing the user can rearrange fixes this, so unlike the full shelf there
   * is no action to point at - but the one thing they must not be left
   * believing is that auto-saving is running. It is not, and every write this
   * session makes is being discarded.
   */
  const noticeRefused = () => {
    if (refusedNoticeShown) return
    const shown = showToast(
      'Auto-saving is not working: this device refused to store the flame. Export a PNG or share a link to keep this one.',
      12000,
    )
    if (shown !== -1) refusedNoticeShown = true
  }

  /** Say what a write that did not land actually was. A refusal read as
   *  success for as long as only `full` was worth mentioning, so a user could
   *  edit for hours with every write discarded and nothing said. */
  const noticeOutcome = (outcome: FlushOutcome | RecentWriteOutcome) => {
    if (outcome === 'full') noticeFull()
    else if (outcome === 'refused') noticeRefused()
  }

  const autosaveNow = () => {
    noticeOutcome(writeToRecents(false))
  }

  /**
   * Save the open document if it holds anything unsaved, and say what
   * happened. Callers act on the answer differently, which is why this
   * reports one instead of swallowing it: a document replacement stops on
   * `full` and asks, pagehide and pause force past it, and the interval
   * autosave raises the notice (lib/documentLoad.ts).
   */
  const flushDirtyToRecents = (force = false): FlushOutcome => {
    if (!isFlameDirty()) return 'clean'
    return writeToRecents(force)
  }

  /**
   * The user has been asked and has chosen to open the other flame anyway.
   *
   * Nothing is written. What changes is that the work stops counting as
   * unsaved, so the chokepoint's own flush does not refuse the replacement a
   * second time over the answer that was just given (lib/documentLoad.ts).
   */
  const dropUnsavedWork = () => {
    autosaveBaseline = autosaveSnapshot()
  }

  /**
   * Settle the questions a document replacement cannot answer for itself,
   * before any of the replacement happens.
   *
   * At the cap the two things that could give way are both the user's: the
   * flame they are looking at, unsaved, or the oldest one they kept. The app
   * picking silently is how a tap on Library came to destroy the open
   * document's keyframe tracks - undo brings a flame back, not its tracks -
   * so it asks, with the same modal Save for Later asks with.
   *
   * A refusal is the other way the flush writes nothing, and it read as
   * success here for as long as only `full` was tested for: the replacement
   * went ahead and took the outgoing flame and its tracks with it, with
   * nothing said at all. There is nothing to trade in that case, so the
   * question is a different one and gets its own prompt - and the answer that
   * keeps their work is the default.
   *
   * @returns whether the replacement may go ahead. False is the user's own
   * no, and then nothing is loaded and their work stays on screen.
   */
  const prepareDocumentReplacement = async (): Promise<boolean> => {
    const kept = () => {
      // A tap that appears to do nothing is the one outcome a user cannot
      // report, so name what their answer did.
      showToast('Kept the open flame. Nothing was loaded.', 5000)
      return false
    }
    const outcome = flushDirtyToRecents()
    if (outcome === 'clean' || outcome === 'saved') return true
    if (outcome === 'full') {
      if (!(await confirmOverwriteOldest())) return kept()
      if (flushDirtyToRecents(true) === 'saved') return true
      // They said yes and it still did not land, which is storage refusing
      // rather than the shelf being full. Falling through to the refusal
      // question rather than going ahead: the eviction they agreed to bought
      // nothing, and the work on screen is still the only copy there is.
    }
    if (!(await confirmDiscardUnsaved())) return kept()
    dropUnsavedWork()
    return true
  }

  /**
   * The user's own save: the one write allowed to replace a flame they kept,
   * because it is the one that asks first. It stores `savedFlame`, as every
   * write here does, so a click inside the gallery's leave delay keeps no
   * hovered partner. One action for the desktop button and the touch
   * layouts' menu alike (components/Shell/moreMenuItems.ts).
   *
   * Nothing here claims more than happened: `full` is the only outcome worth
   * asking about, anything else means the write did not land and the
   * workspace stays dirty so the next boundary tries again.
   */
  const saveForLater = async () => {
    const tracks = getTracks() ?? []
    const config = getConfig()
    const saved = (force: boolean) =>
      saveRecentFlame(savedFlame(), undefined, tracks, force, config)
    const announce = (replacedOldest: boolean) => {
      markSavedBaseline()
      showToast(
        tracks.length > 0
          ? `Flame + animation saved${replacedOldest ? ' (replaced oldest)' : ' for later'}`
          : `Flame saved${replacedOldest ? ' (replaced oldest)' : ' for later'}`,
      )
    }
    const outcome = saved(false)
    if (outcome === 'saved') {
      announce(false)
      return
    }
    if (outcome === 'refused') {
      showToast('Could not save the flame to Recents', 5000)
      return
    }
    if (!(await confirmOverwriteOldest())) return
    if (saved(true) === 'saved') {
      announce(true)
    } else {
      showToast('Could not save the flame to Recents', 5000)
    }
  }

  const saveOnPagehide = () => {
    // One of the two automatic paths allowed to evict a kept flame - the
    // other is the pause save below - because they are the ones with nobody
    // to ask and no next chance: the process is going away, and losing the
    // oldest entry on the shelf is the smaller loss against certainly losing
    // the document that is open.
    if (flushDirtyToRecents() === 'full') flushDirtyToRecents(true)
    // The one-per-run notice is deliberately not spent here. A toast raised
    // as the page is being torn down is never on screen long enough to read,
    // and spending the flag on it would silence the notice for the rest of
    // the run - so the user would never learn the shelf is full.
  }
  /**
   * The write a native app makes when the OS backgrounds it (lib/pauseSave.ts).
   *
   * Same reasoning as pagehide, for the platform that never fires it: a
   * force-stopped WebView gets no pagehide at all, so this is the crash net,
   * and it forces past the cap because there is nobody to ask and the process
   * may not come back. The common case never reaches the force - this
   * session's entry is already on the list, and writing into an id that is
   * there replaces it rather than growing the list, so nothing is evicted.
   *
   * Deliberately NOT gated on `autosaveRecents`. Declining "auto-save your
   * flames while you edit?" is declining a habit, not "lose my work when the
   * OS kills the app": the interval writer below obeys that setting and this
   * does not, and since the single draft slot was folded into Recents this is
   * the only thing standing between a force-stop and the open document.
   *
   * A clean document writes nothing, which is what keeps the Library still:
   * Android fires pause for every share sheet and every permission dialog,
   * and a write would move this session's entry to the front of the list each
   * time.
   *
   * @returns what the write did, where it put it and what it cost, for the
   * caller to carry to the next launch - a toast raised as the process ends
   * is never read (lib/pauseSave.ts).
   */
  const saveOnPause = (): PauseSaveReport => {
    const first = flushDirtyToRecents()
    // The id goes out only when the write landed. Naming an entry that was
    // never written would send the next launch to whatever else happens to
    // hold that id - or, far more often, to nothing at all.
    if (first !== 'full') {
      return first === 'saved'
        ? { outcome: first, entryId: autosaveSessionId }
        : { outcome: first }
    }
    // The shelf is full and this session owns no place on it, so the forced
    // write below makes room by dropping the oldest kept flame. Read its name
    // while it is still there - afterwards there is nothing left to name it
    // with. Forcing is right, because the process may be ending; but an
    // Android pause is as often a share sheet as a death sentence, so what it
    // cost is carried to the next launch rather than left to be discovered by
    // its absence.
    const evicted = getOldestRecentFlame()?.name
    const outcome = flushDirtyToRecents(true)
    // A forced write that storage still refused replaced nothing, and must
    // not report that it did.
    if (outcome !== 'saved') return { outcome }
    return {
      outcome,
      entryId: autosaveSessionId,
      ...(evicted === undefined ? {} : { evicted }),
    }
  }

  window.addEventListener('pagehide', saveOnPagehide)
  onCleanup(() => {
    window.removeEventListener('pagehide', saveOnPagehide)
  })

  const question = createAutosaveQuestion({
    agentDriving,
    showToast,
    dismissToast,
    // The notice belongs to this write too: the user has just asked for
    // auto-saving, so a write that did not land is theirs to hear about. A
    // refusal especially: answering yes and seeing no complaint is how a
    // session came to edit for hours with every write discarded.
    onYes: () => {
      noticeOutcome(flushDirtyToRecents())
    },
  })

  const reminder = createSaveReminder({ agentDriving, showToast, dismissToast })

  const AUTOSAVE_POLL_MS = 30_000
  const autosavePoll = setInterval(() => {
    const dirty = isFlameDirty()
    if (dirty && editingSince === null) editingSince = Date.now()

    // The first-run question. It waits while a view with its own top bar
    // covers the editor (hooks/autosaveQuestion.ts).
    if (dirty && autosaveRecents() === 'unset' && question.ask()) return

    if (dirty && autosaveRecents() === 'on') {
      const intervalMs = Math.max(1, autosaveIntervalMin()) * 60_000
      if (Date.now() - lastAutosaveAt >= intervalMs) autosaveNow()
    }

    // Held like the question while the editor is covered (hooks/saveReminder.ts).
    reminder.poll(editingSince)
  }, AUTOSAVE_POLL_MS)

  onCleanup(() => {
    clearInterval(autosavePoll)
  })

  return {
    isFlameDirty,
    markSavedBaseline,
    markLoadedBaseline,
    autosaveNow,
    flushDirtyToRecents,
    prepareDocumentReplacement,
    saveForLater,
    saveOnPause,
  }
}
