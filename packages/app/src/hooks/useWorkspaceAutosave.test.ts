import { createRoot, createSignal } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setArenaShowing } from '@/arcade/editorCover'
import { examples } from '@/flame/examples'
import { parseFlameXml } from '@/flame/flameXml'
import { setActiveTab } from '@/lib/activeTab'
import { autosaveRecents, setAutosaveRecents, setSaveReminderDismissed, } from '@/utils/autosaveSettings'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { clearRecentFlames, loadRecentFlames, loadRecentFlamesForRewrite, MAX_RECENT_FLAMES, } from '@/utils/recentFlames'
import { useWorkspaceAutosave } from './useWorkspaceAutosave'
import { BREED_PREVIEW_DELAY_MS, useWorkspaceBlendPick, } from './useWorkspaceBlendPick'
import type { BlendIntent } from './useWorkspaceBlendPick'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

// Same reason as draft.test.ts: localStorage is not usable in this runtime, so
// Recents round-trips through an in-memory store. `storageRefuses` is the
// quota / private window / locked-down WebView case, which is the one this
// file is mostly about.
const store = new Map<string, string>()
let storageRefuses = false
vi.mock('@/utils/storage', () => ({
  safeGetItem: (key: string) => store.get(key) ?? null,
  safeSetItem: (key: string, value: string) => {
    if (storageRefuses) return false
    store.set(key, value)
    return true
  },
  safeRemoveItem: (key: string) => {
    store.delete(key)
  },
}))

const parsed = parseFlameXml(`<?xml version="1.0" encoding="UTF-8"?>
<flame name="Open" version="Apophysis 7X" size="800 600"
       center="0 0" scale="200" oversample="1" filter="0.5"
       quality="100" background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" linear="1" coefs="1 0 0 1 0 0"/>
</flame>`)
const flame: FlameDescriptor = {
  ...parsed,
  metadata: { ...parsed.metadata, name: 'Open' },
}

/** A shelf with no room left on it, written structurally so the cap is
 *  reached without 150 schema passes. */
const fillRecents = () => {
  store.set(
    'chaos-master-recent-flames',
    JSON.stringify(
      Array.from({ length: MAX_RECENT_FLAMES }, (_, index) => ({
        id: `kept-${index}`,
        name: `Kept ${index}`,
        savedAt: 1000 + index,
        flame,
      })),
    ),
  )
}

const declineOverwrite = () => Promise.resolve(false)
const keepUnsaved = () => Promise.resolve(false)

/**
 * A workspace wired the way MainWorkspace wires one, with the toast store
 * under the test's control.
 *
 * `muted` is what the store does while an Arcade pilot drives: it shows
 * nothing and returns -1 (contexts/ToastContext.tsx). Toasts raised in that
 * state are the ones the one-per-run notices used to be spent on.
 */
const workspace = (
  options: {
    muted?: () => boolean
    confirmOverwriteOldest?: () => Promise<boolean>
    confirmDiscardUnsaved?: () => Promise<boolean>
  } = {},
) => {
  const toasts: string[] = []
  const shown = new Map<number, string>()
  const [open, setOpen] = createStore<FlameDescriptor>(
    JSON.parse(JSON.stringify(flame)),
  )
  let nextToastId = 1
  const autosave = useWorkspaceAutosave({
    flameDescriptor: open,
    getTracks: () => [],
    getConfig: () => undefined,
    agentDriving: () => false,
    showToast: (message) => {
      if (options.muted?.()) return -1
      toasts.push(message)
      shown.set(nextToastId, message)
      return nextToastId++
    },
    dismissToast: (id) => {
      shown.delete(id)
    },
    confirmOverwriteOldest: options.confirmOverwriteOldest ?? declineOverwrite,
    confirmDiscardUnsaved: options.confirmDiscardUnsaved ?? keepUnsaved,
  })
  /** The toasts on screen now: shown and not withdrawn. */
  const onScreen = () => [...shown.values()]
  return { autosave, setOpen, toasts, onScreen }
}

afterEach(() => {
  setArenaShowing(false)
  setActiveTab('workspace')
  storageRefuses = false
  clearRecentFlames()
  store.clear()
  setAutosaveRecents('unset')
  setSaveReminderDismissed(false)
  vi.useRealTimers()
})

describe('what an autosave says when it did not land', () => {
  it('names a refusal rather than reporting nothing at all', () => {
    // A full shelf was the only outcome worth mentioning, so a refusal - a
    // quota, a private window, a locked-down WebView - looked exactly like a
    // save. The user could answer "yes, auto-save my flames", see no
    // complaint, and edit for hours with every write discarded.
    createRoot((dispose) => {
      const { autosave, setOpen, toasts } = workspace()
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')
      storageRefuses = true

      autosave.autosaveNow()

      expect(toasts.join(' ')).toContain('Auto-saving is not working')
      // And it does not claim the flame is somewhere it is not.
      expect(loadRecentFlames()).toHaveLength(0)
      dispose()
    })
  })

  it('says a refusal once, not every interval', () => {
    createRoot((dispose) => {
      const { autosave, setOpen, toasts } = workspace()
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')
      storageRefuses = true

      autosave.autosaveNow()
      autosave.autosaveNow()

      expect(toasts).toHaveLength(1)
      dispose()
    })
  })

  it('does not spend its one notice on a toast nobody saw', () => {
    // The store is muted while an Arcade pilot drives and shows nothing,
    // returning -1. The flag used to be set before the call, so a lesson
    // running at the wrong moment swallowed the only notice the run gets and
    // the shelf stayed silently full for the rest of the session.
    fillRecents()
    let muted = true
    createRoot((dispose) => {
      const { autosave, setOpen, toasts } = workspace({ muted: () => muted })
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')

      autosave.autosaveNow()
      expect(toasts).toHaveLength(0)

      muted = false
      autosave.autosaveNow()
      expect(toasts.join(' ')).toContain('Recents is full')
      dispose()
    })
  })

  it('does not spend the refusal notice on a muted toast either', () => {
    let muted = true
    createRoot((dispose) => {
      const { autosave, setOpen, toasts } = workspace({ muted: () => muted })
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')
      storageRefuses = true

      autosave.autosaveNow()
      expect(toasts).toHaveLength(0)

      muted = false
      autosave.autosaveNow()
      expect(toasts.join(' ')).toContain('Auto-saving is not working')
      dispose()
    })
  })
})

describe('the Recents entry a session writes to', () => {
  it('is a new one at every load boundary, same flame or not', () => {
    // THE SEQUENCE. Open F, edit it, then open F again from Library - the
    // natural "start over from the original". The flush at the replacement
    // writes the edits into this session's entry; the boundary used to keep
    // that entry because the incoming descriptor was identical, and the next
    // autosave of the fresh copy replaced them. The entry even keeps its
    // name, so nothing looks wrong.
    createRoot((dispose) => {
      const { autosave, setOpen } = workspace()
      autosave.markLoadedBaseline()

      setOpen('metadata', 'name', 'An hour of work')
      expect(autosave.flushDirtyToRecents()).toBe('saved')

      // Re-opening the same flame: the descriptor the boundary sees is the
      // one it saw last time.
      setOpen('metadata', 'name', 'Open')
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Second session')
      expect(autosave.flushDirtyToRecents()).toBe('saved')

      const names = loadRecentFlames().map(
        (entry) => entry.flame.metadata?.name,
      )
      expect(names).toContain('An hour of work')
      expect(names).toContain('Second session')
      dispose()
    })
  })

  it('is a new one for a second New Flame, which loads the same starter', () => {
    // The same hole reached without Library: New Flame twice produces two
    // identical descriptors, so the second boundary kept the entry the first
    // session's work had just been flushed into.
    createRoot((dispose) => {
      const { autosave, setOpen } = workspace()
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Edited the starter')
      autosave.flushDirtyToRecents()

      setOpen('metadata', 'name', 'Open')
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Edited it again')
      autosave.flushDirtyToRecents()

      expect(loadRecentFlamesForRewrite()).toHaveLength(2)
      dispose()
    })
  })
})

describe('a replacement the open flame could not be saved for', () => {
  it('stops and asks when storage refused the flush', () => {
    // `refused` fell through as if the write had landed, so the replacement
    // destroyed the outgoing flame and its keyframe tracks with nothing said
    // at all. Undo brings a flame back; it does not bring tracks back.
    storageRefuses = true
    let asked = 0
    return createRoot(async (dispose) => {
      const { autosave, setOpen } = workspace({
        confirmDiscardUnsaved: () => {
          asked += 1
          return Promise.resolve(false)
        },
      })
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')

      expect(await autosave.prepareDocumentReplacement()).toBe(false)
      expect(asked).toBe(1)
      // Still on screen, still unsaved, still the user's to export or share.
      expect(autosave.isFlameDirty()).toBe(true)
      dispose()
    })
  })

  it('names what the answer did, so the tap is not a no-op', () => {
    storageRefuses = true
    return createRoot(async (dispose) => {
      const { autosave, setOpen, toasts } = workspace()
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')

      await autosave.prepareDocumentReplacement()

      expect(toasts.join(' ')).toContain('Kept the open flame')
      dispose()
    })
  })

  it('goes ahead only on the user saying so', () => {
    storageRefuses = true
    return createRoot(async (dispose) => {
      const { autosave, setOpen } = workspace({
        confirmDiscardUnsaved: () => Promise.resolve(true),
      })
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')

      expect(await autosave.prepareDocumentReplacement()).toBe(true)
      // The answer settles it for the chokepoint too, which flushes again and
      // would otherwise refuse the replacement it was just given permission
      // for (lib/documentLoad.ts).
      expect(autosave.flushDirtyToRecents()).toBe('clean')
      dispose()
    })
  })

  it('asks the refusal question when a yes at the cap still does not land', () => {
    // They agreed to evict the oldest kept flame and the write failed anyway,
    // which is storage refusing rather than the shelf being full. Going ahead
    // regardless spent their oldest flame AND lost the open one.
    fillRecents()
    let askedDiscard = 0
    return createRoot(async (dispose) => {
      const { autosave, setOpen } = workspace({
        confirmOverwriteOldest: () => {
          storageRefuses = true
          return Promise.resolve(true)
        },
        confirmDiscardUnsaved: () => {
          askedDiscard += 1
          return Promise.resolve(false)
        },
      })
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')

      expect(await autosave.prepareDocumentReplacement()).toBe(false)
      expect(askedDiscard).toBe(1)
      dispose()
    })
  })
})

describe('the flames on the shelf, when the shelf is full', () => {
  it('never pushes one out on a write nobody was asked about', () => {
    // The rule every automatic writer is held to (utils/recentFlames.ts): the
    // 150 entries are flames the user chose to keep, and an autosave is work
    // they have not asked to keep. Silence would be the app quietly not
    // saving, so the interval writer declines AND says so.
    fillRecents()
    createRoot((dispose) => {
      const { autosave, setOpen, toasts } = workspace()
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')

      autosave.autosaveNow()

      const kept = loadRecentFlamesForRewrite()
      expect(kept).toHaveLength(MAX_RECENT_FLAMES)
      expect(kept.some((entry) => entry.id === 'kept-149')).toBe(true)
      expect(
        kept.some((entry) => entry.flame.metadata?.name === 'Unsaved work'),
      ).toBe(false)
      expect(toasts.join(' ')).toContain('Recents is full')
      dispose()
    })
  })

  it('spends the oldest kept flame at a boundary only when the user says so', async () => {
    // Declining looked right everywhere until the boundary flush turned out
    // to be the ONLY thing that saves the OUTGOING document
    // (lib/documentLoad.ts). At the cap, refusing there meant opening
    // anything from Library destroyed whatever was unsaved in what was on
    // screen - and undo restores a flame, not its keyframe tracks. The live
    // document is the work the user can see; the 150th-oldest entry is the
    // work they cannot. So the boundary asks, and a yes is what spends it.
    fillRecents()
    let asked = 0
    await createRoot(async (dispose) => {
      const { autosave, setOpen } = workspace({
        confirmOverwriteOldest: () => {
          asked += 1
          return Promise.resolve(true)
        },
      })
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')

      // The write itself still declines on its own. Only the answer moves it.
      expect(autosave.flushDirtyToRecents()).toBe('full')
      expect(await autosave.prepareDocumentReplacement()).toBe(true)
      expect(asked).toBe(1)

      const kept = loadRecentFlamesForRewrite()
      expect(kept).toHaveLength(MAX_RECENT_FLAMES)
      expect(kept[0]?.flame.metadata?.name).toBe('Unsaved work')
      expect(kept.some((entry) => entry.id === 'kept-149')).toBe(false)
      expect(autosave.isFlameDirty()).toBe(false)
      dispose()
    })
  })

  it('forces the pagehide flush, because there is nobody left to ask', () => {
    // One of the two paths allowed what no other is - the pause save is the
    // other (lib/pauseSave.ts). A pagehide has no prompt available and no
    // next chance: the alternative to evicting the oldest kept flame is
    // certainly losing the document that is open.
    fillRecents()
    createRoot((dispose) => {
      const { autosave, setOpen, toasts } = workspace()
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Edited before the process died')

      window.dispatchEvent(new Event('pagehide'))

      const kept = loadRecentFlamesForRewrite()
      expect(kept[0]?.flame.metadata?.name).toBe(
        'Edited before the process died',
      )
      expect(kept).toHaveLength(MAX_RECENT_FLAMES)
      // The one-per-run notice is spent only by showing it, so no toast here
      // is the whole assertion: a toast raised as the page is torn down is
      // never read, and burning the flag on it would silence the notice for
      // the rest of the run.
      expect(toasts).toEqual([])
      dispose()
    })
  })
})

/**
 * A workspace with the partner gallery's hover preview in it, wired the way
 * MainWorkspace wires the two: autosave reads the document with the preview
 * taken off (galleryPreviewWiring.test.ts holds MainWorkspace to that).
 */
/** Disposed after each test, pass or fail, so a failed assertion cannot
 *  leave a pagehide listener behind to write into the next test's shelf. */
const previewRoots: (() => void)[] = []
afterEach(() => {
  for (const dispose of previewRoots.splice(0)) dispose()
})

const previewWorkspace = () =>
  createRoot((dispose) => {
    previewRoots.push(dispose)
    return buildPreviewWorkspace()
  })

const buildPreviewWorkspace = () => {
  const [open, setOpen, history] = createStoreHistory(
    createStore<FlameDescriptor>(JSON.parse(JSON.stringify(flame))),
  )
  const [intent, setIntent] = createSignal<BlendIntent>('blend')
  const blendPick = useWorkspaceBlendPick({
    flame: () => open,
    setSilently: history.setSilently,
    execute: () => {},
    intent,
  })
  const autosave = useWorkspaceAutosave({
    flameDescriptor: open,
    savedFlame: blendPick.withoutPreview,
    getTracks: () => [],
    getConfig: () => undefined,
    agentDriving: () => false,
    showToast: () => 1,
    confirmOverwriteOldest: declineOverwrite,
    confirmDiscardUnsaved: keepUnsaved,
  })
  const hover = () => {
    blendPick.preview(JSON.parse(JSON.stringify(examples.example2)))
  }
  return { autosave, setOpen, blendPick, setIntent, hover, open }
}

/** The flame the one Recents entry holds, as stored. */
const stored = () => {
  const entries = loadRecentFlamesForRewrite()
  expect(entries).toHaveLength(1)
  return entries[0]!.flame
}

describe('the gallery hover preview, and every write of the document', () => {
  it('is not stored by the pagehide flush', () => {
    {
      const { autosave, setOpen, hover } = previewWorkspace()
      autosave.markLoadedBaseline()
      setOpen((draft) => {
        draft.metadata = { ...draft.metadata, name: 'Edited' }
      })
      hover()

      window.dispatchEvent(new Event('pagehide'))

      expect(stored().metadata?.name).toBe('Edited')
      expect(stored().renderSettings.blendFlame).toBeUndefined()
      expect(stored().renderSettings.blendWeight).toBeUndefined()
    }
  })

  it('is not stored by the 30-second autosave', () => {
    vi.useFakeTimers()
    setAutosaveRecents('on')
    {
      const { autosave, setOpen, hover } = previewWorkspace()
      autosave.markLoadedBaseline()
      setOpen((draft) => {
        draft.metadata = { ...draft.metadata, name: 'Edited' }
      })
      hover()

      vi.advanceTimersByTime(30_000)

      expect(stored().metadata?.name).toBe('Edited')
      expect(stored().renderSettings.blendFlame).toBeUndefined()
    }
  })

  it('is not stored by the flush before a document replacement', async () => {
    const { autosave, setOpen, hover } = previewWorkspace()
    autosave.markLoadedBaseline()
    setOpen((draft) => {
      draft.metadata = { ...draft.metadata, name: 'Edited' }
    })
    hover()

    expect(await autosave.prepareDocumentReplacement()).toBe(true)

    expect(stored().metadata?.name).toBe('Edited')
    expect(stored().renderSettings.blendFlame).toBeUndefined()
  })

  it('is not stored by the save a native app makes when it is paused', () => {
    {
      const { autosave, setOpen, hover } = previewWorkspace()
      autosave.markLoadedBaseline()
      setOpen((draft) => {
        draft.metadata = { ...draft.metadata, name: 'Edited' }
      })
      hover()

      expect(autosave.saveOnPause().outcome).toBe('saved')

      expect(stored().renderSettings.blendFlame).toBeUndefined()
    }
  })

  it('is not stored by Save for Later', async () => {
    const { autosave, setOpen, hover } = previewWorkspace()
    autosave.markLoadedBaseline()
    setOpen((draft) => {
      draft.metadata = { ...draft.metadata, name: 'Edited' }
    })
    hover()

    await autosave.saveForLater()

    expect(stored().metadata?.name).toBe('Edited')
    expect(stored().renderSettings.blendFlame).toBeUndefined()
    expect(autosave.isFlameDirty()).toBe(false)
  })

  it('is not unsaved work on its own', () => {
    {
      const { autosave, hover, open } = previewWorkspace()
      autosave.markLoadedBaseline()

      hover()

      expect(open.renderSettings.blendFlame).toBeDefined()
      expect(autosave.isFlameDirty()).toBe(false)
      window.dispatchEvent(new Event('pagehide'))
      expect(loadRecentFlamesForRewrite()).toEqual([])
    }
  })

  it('stores the flame a breed preview replaced, not the child it shows', () => {
    vi.useFakeTimers()
    {
      const { autosave, setOpen, setIntent, hover, open } = previewWorkspace()
      autosave.markLoadedBaseline()
      setOpen((draft) => {
        draft.metadata = { ...draft.metadata, name: 'Edited' }
      })
      const edited = JSON.parse(JSON.stringify(unwrap(open))) as FlameDescriptor
      setIntent('breed')
      hover()
      vi.advanceTimersByTime(BREED_PREVIEW_DELAY_MS)
      expect(JSON.stringify(unwrap(open).transforms)).not.toBe(
        JSON.stringify(edited.transforms),
      )

      window.dispatchEvent(new Event('pagehide'))

      expect(stored().metadata?.name).toBe('Edited')
      expect(stored().transforms).toEqual(edited.transforms)
    }
  })
})

const CONSENT = 'Auto-save your flames to Recents while you edit?'

// On a real GPU the question landed over the Arena and took the click meant
// for Exit Arena. A view with its own top bar holds the question; the editor
// gets it as usual once the viewer is back.
describe('the auto-save question over a view with its own top bar', () => {
  it('waits while the Arena is open, and is asked back in the editor', () => {
    vi.useFakeTimers()
    createRoot((dispose) => {
      const { autosave, setOpen, toasts } = workspace()
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Edited')
      setArenaShowing(true)

      vi.advanceTimersByTime(90_000)
      expect(toasts).not.toContain(CONSENT)

      setArenaShowing(false)
      vi.advanceTimersByTime(30_000)
      expect(toasts.filter((t) => t === CONSENT)).toHaveLength(1)
      dispose()
    })
  })

  it('waits over the Arcade hub and over Home too', () => {
    vi.useFakeTimers()
    createRoot((dispose) => {
      const { autosave, setOpen, toasts } = workspace()
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Edited')

      setActiveTab('arcade')
      vi.advanceTimersByTime(30_000)
      setActiveTab('home')
      vi.advanceTimersByTime(30_000)
      expect(toasts).not.toContain(CONSENT)

      setActiveTab('workspace')
      vi.advanceTimersByTime(30_000)
      expect(toasts).toContain(CONSENT)
      dispose()
    })
  })

  it('steps aside when the Arena opens over an unanswered question', () => {
    vi.useFakeTimers()
    // Built in a root and driven outside it, as the app runs: the effect
    // that watches the cover starts once the root has been set up.
    const { ws, dispose } = createRoot((dispose) => ({
      ws: workspace(),
      dispose,
    }))
    const { autosave, setOpen, toasts, onScreen } = ws
    autosave.markLoadedBaseline()
    setOpen('metadata', 'name', 'Edited')
    vi.advanceTimersByTime(30_000)
    expect(onScreen()).toContain(CONSENT)

    setArenaShowing(true)
    expect(onScreen()).not.toContain(CONSENT)
    vi.advanceTimersByTime(60_000)
    expect(onScreen()).not.toContain(CONSENT)

    setArenaShowing(false)
    vi.advanceTimersByTime(30_000)
    expect(onScreen()).toContain(CONSENT)
    expect(toasts.filter((t) => t === CONSENT)).toHaveLength(2)
    expect(autosaveRecents()).toBe('unset')
    dispose()
  })

  it('leaves the answer and its storage alone', () => {
    vi.useFakeTimers()
    createRoot((dispose) => {
      const { autosave, setOpen } = workspace()
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Edited')
      setArenaShowing(true)
      vi.advanceTimersByTime(60_000)
      expect(autosaveRecents()).toBe('unset')
      dispose()
    })
  })
})

const REMINDER =
  'Enjoying this flame? Save it for later, export a PNG, or share a link from the actions bar.'

// The save reminder has a button too ("Don't show again"), so it follows the
// same rule as the question: held while a view with its own top bar covers
// the editor, and taken down if one opens over it.
describe('the save reminder over a view with its own top bar', () => {
  /** Built in a root and driven outside it, as the app runs. The question is
   *  answered already, so the poll gets as far as the reminder. */
  const edited = () => {
    setAutosaveRecents('off')
    const { ws, dispose } = createRoot((dispose) => ({
      ws: workspace(),
      dispose,
    }))
    ws.autosave.markLoadedBaseline()
    ws.setOpen('metadata', 'name', 'Edited')
    return { ...ws, dispose }
  }
  const count = (toasts: string[]) =>
    toasts.filter((t) => t === REMINDER).length

  it('waits while the Arena is open, and shows back in the editor', () => {
    vi.useFakeTimers()
    const { toasts, onScreen, dispose } = edited()
    setArenaShowing(true)
    vi.advanceTimersByTime(8 * 60_000)
    expect(toasts).not.toContain(REMINDER)

    setArenaShowing(false)
    vi.advanceTimersByTime(30_000)
    expect(count(toasts)).toBe(1)
    expect(onScreen()).toContain(REMINDER)
    dispose()
  })

  it('waits over the Arcade hub too', () => {
    vi.useFakeTimers()
    const { toasts, dispose } = edited()
    setActiveTab('arcade')
    vi.advanceTimersByTime(8 * 60_000)
    expect(toasts).not.toContain(REMINDER)

    setActiveTab('workspace')
    vi.advanceTimersByTime(30_000)
    expect(count(toasts)).toBe(1)
    dispose()
  })

  it('steps aside when the Arena opens over it, and shows again after', () => {
    vi.useFakeTimers()
    const { toasts, onScreen, dispose } = edited()
    vi.advanceTimersByTime(330_000)
    expect(onScreen()).toContain(REMINDER)

    setArenaShowing(true)
    expect(onScreen()).not.toContain(REMINDER)
    vi.advanceTimersByTime(60_000)
    expect(count(toasts)).toBe(1)

    setArenaShowing(false)
    vi.advanceTimersByTime(30_000)
    expect(onScreen()).toContain(REMINDER)
    expect(count(toasts)).toBe(2)
    dispose()
  })

  it('is not shown again when it had already timed out', () => {
    vi.useFakeTimers()
    const { toasts, dispose } = edited()
    vi.advanceTimersByTime(330_000)
    expect(count(toasts)).toBe(1)
    // Its 12 s are over by the next poll.
    vi.advanceTimersByTime(30_000)

    setArenaShowing(true)
    vi.advanceTimersByTime(30_000)
    setArenaShowing(false)
    vi.advanceTimersByTime(90_000)
    expect(count(toasts)).toBe(1)
    dispose()
  })
})
