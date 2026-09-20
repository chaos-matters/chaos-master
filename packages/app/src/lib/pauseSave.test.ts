import { createRoot, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseFlameXml } from '@/flame/flameXml'
import { useWorkspaceAutosave } from '@/hooks/useWorkspaceAutosave'
import { clearRecentFlames, deleteRecentFlame, loadRecentFlames, loadRecentFlamesForRewrite, MAX_RECENT_FLAMES, } from '@/utils/recentFlames'
import { safeSetItem } from '@/utils/storage'
import { defaultConfig } from '@/utils/timeline'
import { useLifecyclePorts } from './lifecycle'
import { installPauseSave, LEGACY_DRAFT_KEY, migrateLegacyDraft, reopenTarget, stopPauseSave, takePauseSaveEviction, takePauseSaveFailure, } from './pauseSave'
import { createWorkspaceHandoff } from './workspaceHandoff'
import type { LifecyclePorts } from '@chaos-master/mobile-runtime/lifecycle'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineConfig, TimelineTrack } from '@/utils/timeline'

// localStorage is not usable in this runtime (the same reason
// TouchSurface.test.tsx mocks this module), so Recents round-trips through an
// in-memory store. What is under test is where the app puts the work, not the
// browser's storage.
const store = new Map<string, string>()
/**
 * What storage is refusing, and why the two cases are separate.
 *
 * A quota is about bytes: the write that fails is the whole flame list, while
 * the few bytes that say "the last pause could not save" still land - which is
 * the case the report to the next launch exists for. A private window or a
 * locked-down WebView refuses every write, and then there is nowhere to leave
 * a message at all.
 */
let refusing: 'nothing' | 'flames' | 'everything' = 'nothing'
vi.mock('@/utils/storage', () => ({
  safeGetItem: (key: string) => store.get(key) ?? null,
  safeSetItem: (key: string, value: string) => {
    if (refusing === 'everything') return false
    if (refusing === 'flames' && key === 'chaos-master-recent-flames') {
      return false
    }
    store.set(key, value)
    return true
  },
  safeRemoveItem: (key: string) => {
    store.delete(key)
  },
}))

const RECENTS_KEY = 'chaos-master-recent-flames'

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

const tracks: TimelineTrack[] = [
  {
    parameterPath: 'renderSettings.brightness',
    keyframes: [
      { frame: 0, value: 1 },
      { frame: 60, value: 2 },
    ],
  },
]

const config: TimelineConfig = {
  fps: 60,
  timeScale: 2,
  startFrame: 0,
  endFrame: 300,
  loop: false,
  autoFps: false,
  loopMode: 'seamless',
}

/** A Recents list with no room left on it, written structurally so the cap is
 *  reached without 150 schema passes. */
const fillRecents = (ids: string[] = []) => {
  safeSetItem(
    RECENTS_KEY,
    JSON.stringify(
      Array.from({ length: MAX_RECENT_FLAMES }, (_, index) => ({
        id: ids[index] ?? `kept-${index}`,
        name: `Kept ${index}`,
        savedAt: 1000 + index,
        flame,
      })),
    ),
  )
}

/** A fake platform, so what fires here is the pause the app subscribes to. */
function fakePlatform() {
  const pauses = new Set<() => void>()
  const ports: LifecyclePorts = {
    onBackButton: () => () => undefined,
    onPause: (callback: () => void) => {
      pauses.add(callback)
      return () => pauses.delete(callback)
    },
    onResume: () => () => undefined,
    minimizeApp: () => Promise.resolve(),
  }
  useLifecyclePorts(ports)
  return {
    pause: () => {
      pauses.forEach((callback) => {
        callback()
      })
    },
  }
}

const declineOverwrite = () => Promise.resolve(false)
const keepUnsaved = () => Promise.resolve(false)

/**
 * A workspace wired the way MainWorkspace wires one: the editor's autosave,
 * and the pause write installed from it.
 *
 * The tracks and the timeline are live values rather than constants, because
 * a hand-off lands the flame in one effect and its animation in another, and
 * a pause can fall between the two.
 */
const workspace = (open: FlameDescriptor = flame) => {
  const [flameStore, setOpen] = createStore<FlameDescriptor>(
    JSON.parse(JSON.stringify(open)),
  )
  const [liveTracks, setTracks] = createSignal<TimelineTrack[]>(tracks)
  const [liveConfig, setConfig] = createSignal<TimelineConfig>(config)
  const toasts: string[] = []
  const autosave = useWorkspaceAutosave({
    flameDescriptor: flameStore,
    getTracks: liveTracks,
    getConfig: liveConfig,
    agentDriving: () => false,
    confirmOverwriteOldest: declineOverwrite,
    confirmDiscardUnsaved: keepUnsaved,
    showToast: (message) => {
      toasts.push(message)
      return toasts.length
    },
  })
  installPauseSave({ native: true, save: autosave.saveOnPause })
  autosave.markLoadedBaseline()
  return { autosave, setOpen, setTracks, setConfig, toasts }
}

afterEach(() => {
  refusing = 'nothing'
  stopPauseSave()
  clearRecentFlames()
  store.clear()
})

describe('the save a pause makes', () => {
  it('puts the open document where every other save puts it', () => {
    // THE WHOLE POINT OF THE FOLD. The work goes to Recents, through the
    // writer the editor already uses, so the next cold start finds it on the
    // shelf with nothing to rescue, nothing to seed and no notice to get
    // right - the steps that lost it.
    const platform = fakePlatform()
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'An hour of work')

      platform.pause()

      const recents = loadRecentFlames()
      expect(recents).toHaveLength(1)
      expect(recents[0]?.flame.metadata?.name).toBe('An hour of work')
      expect(recents[0]?.tracks?.[0]?.parameterPath).toBe(
        tracks[0]?.parameterPath,
      )
      // The timeline goes with it. Without it the animation came back at the
      // workspace's defaults, 30fps over 90 frames, however long it was.
      expect(recents[0]?.config?.fps).toBe(60)
      expect(recents[0]?.config?.endFrame).toBe(300)
      dispose()
    })

    // The cold start after the force-stop: nothing to migrate, nothing to
    // report, and the work is already there.
    migrateLegacyDraft()
    expect(takePauseSaveFailure()).toBe(false)
    expect(loadRecentFlames()[0]?.flame.metadata?.name).toBe('An hour of work')
  })

  it('counts a change to only the timeline as work, as the app must', () => {
    // The frame rate, the end frame and the loop mode are part of the
    // document and live in their own signal. Until they were in the dirty
    // snapshot, changing one and nothing else left the app believing there
    // was nothing to keep, and the change died with the process.
    const platform = fakePlatform()
    createRoot((dispose) => {
      const { autosave, setConfig } = workspace()
      expect(autosave.isFlameDirty()).toBe(false)

      setConfig({ ...config, fps: 24 })

      platform.pause()
      expect(loadRecentFlames()[0]?.config?.fps).toBe(24)
      dispose()
    })
  })

  it('writes nothing, and moves nothing, for a document that is clean', () => {
    // Android fires pause for every share sheet and every permission dialog.
    // A write per pause would reorder the Library under the user all day, and
    // the dedupe that used to live in the draft envelope is the editor's own
    // dirty flag now: a write re-takes the baseline, so the pause after it
    // has nothing to do.
    const platform = fakePlatform()
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'Saved once')
      platform.pause()
      const first = loadRecentFlamesForRewrite()[0]

      // A share sheet, an app switch, a permission dialog.
      platform.pause()
      platform.pause()

      const after = loadRecentFlamesForRewrite()
      expect(after).toHaveLength(1)
      expect(after[0]?.savedAt).toBe(first?.savedAt)
      dispose()
    })
  })

  it('does nothing on the web, where a tab gets its pagehide', () => {
    const platform = fakePlatform()
    createRoot((dispose) => {
      const [flameStore, setOpen] = createStore<FlameDescriptor>(
        JSON.parse(JSON.stringify(flame)),
      )
      const autosave = useWorkspaceAutosave({
        flameDescriptor: flameStore,
        getTracks: () => tracks,
        getConfig: () => config,
        agentDriving: () => false,
        confirmOverwriteOldest: declineOverwrite,
        confirmDiscardUnsaved: keepUnsaved,
        showToast: () => 0,
      })
      installPauseSave({ native: false, save: autosave.saveOnPause })
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Unsaved work')

      platform.pause()

      expect(loadRecentFlames()).toHaveLength(0)
      dispose()
    })
  })

  it('keeps saving after the workspace unmounts under it', () => {
    // An ErrorBoundary catch (App.tsx) or a WebGPU degrade takes the editor
    // off screen, and the process carries on holding the user's last flame.
    // An `onCleanup` on the pause subscription unregistered the crash net at
    // exactly that moment, so the force-stop that followed took the work with
    // it. The subscription outlives the component that installed it.
    const platform = fakePlatform()
    let unmounted!: () => void
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'On screen when it crashed')
      unmounted = dispose
    })
    unmounted()

    platform.pause()

    expect(loadRecentFlames()[0]?.flame.metadata?.name).toBe(
      'On screen when it crashed',
    )
  })
})

describe('a pause at the cap', () => {
  it('writes into the entry this session owns, evicting nothing', () => {
    // The common case, and the one worth keeping common: the session's entry
    // is already on the list by the time the OS backgrounds the app, and
    // writing into an id that is there replaces it rather than growing the
    // list. No eviction, nothing to force past.
    const platform = fakePlatform()
    fillRecents()
    createRoot((dispose) => {
      const { autosave, setOpen } = workspace()
      setOpen('metadata', 'name', 'First save of the session')
      // The user answered "yes, auto-save", or a load boundary flushed: this
      // session now owns one of the 150 places.
      expect(autosave.flushDirtyToRecents(true)).toBe('saved')
      const owned = loadRecentFlamesForRewrite()[0]?.id

      setOpen('metadata', 'name', 'And then some more')
      platform.pause()

      const kept = loadRecentFlamesForRewrite()
      expect(kept).toHaveLength(MAX_RECENT_FLAMES)
      expect(kept[0]?.id).toBe(owned)
      expect(kept[0]?.flame.metadata?.name).toBe('And then some more')
      dispose()
    })
  })

  it('still saves the work when this session owns no entry yet', () => {
    // The crash the fold exists for: the user has edited and nothing has been
    // written yet, the shelf is full, and the process is about to end. Every
    // other automatic writer declines here rather than deleting a flame the
    // user kept - but there is nobody to ask and no next chance, so this one
    // forces, exactly as the pagehide flush does.
    const platform = fakePlatform()
    fillRecents()
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'The only copy there is')

      platform.pause()

      const kept = loadRecentFlamesForRewrite()
      expect(kept).toHaveLength(MAX_RECENT_FLAMES)
      expect(kept[0]?.flame.metadata?.name).toBe('The only copy there is')
      // One kept flame gave way, which is the smaller loss - and the only
      // path allowed to decide that without asking.
      expect(kept.some((entry) => entry.id === 'kept-149')).toBe(false)
      dispose()
    })
  })
})

describe('what a forced pause write cost', () => {
  it('names the kept flame it replaced, at the next launch, once', () => {
    // Forcing past the cap is sanctioned here - nobody to ask, and the
    // process may be ending - but it deletes a flame the user chose to keep,
    // and pause is a wider door than the pagehide it borrowed the licence
    // from: Android fires it for every share sheet. So the launch after it
    // says which flame went, and says it once.
    const platform = fakePlatform()
    fillRecents()
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'The only copy there is')
      platform.pause()
      dispose()
    })
    stopPauseSave()

    expect(takePauseSaveEviction()).toBe('Kept 149')
    expect(takePauseSaveEviction()).toBeUndefined()
  })

  it('says nothing when the shelf had room', () => {
    const platform = fakePlatform()
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'Room on the shelf')
      platform.pause()
      dispose()
    })
    stopPauseSave()

    expect(takePauseSaveEviction()).toBeUndefined()
  })

  it('says nothing when the session already owned its place', () => {
    // The common case at the cap, and the reason the force is rarely reached:
    // writing into an id that is already on the list replaces that entry and
    // grows nothing, so no kept flame is touched and there is nothing to
    // report.
    const platform = fakePlatform()
    fillRecents()
    createRoot((dispose) => {
      const { autosave, setOpen } = workspace()
      setOpen('metadata', 'name', 'First save of the session')
      expect(autosave.flushDirtyToRecents(true)).toBe('saved')

      setOpen('metadata', 'name', 'And then some more')
      platform.pause()
      dispose()
    })
    stopPauseSave()

    expect(takePauseSaveEviction()).toBeUndefined()
  })

  it('claims nothing when the forced write was refused as well', () => {
    // The shelf is full AND storage says no. Nothing was written and so
    // nothing was replaced - telling the user a flame of theirs had been
    // deleted would be a second loss they never actually took.
    const platform = fakePlatform()
    fillRecents()
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'Work with nowhere to go')
      refusing = 'flames'
      platform.pause()
      refusing = 'nothing'
      dispose()
    })
    stopPauseSave()

    expect(takePauseSaveEviction()).toBeUndefined()
    expect(takePauseSaveFailure()).toBe(true)
  })
})

describe('a pause that could not save', () => {
  it('says so at the next launch, once', () => {
    // The one thing the single slot could do that Recents cannot. A toast
    // raised as the process is being torn down is never read, so the refusal
    // is carried to the launch after it - and said once, because a complaint
    // repeated every launch is one the user learns to ignore.
    const platform = fakePlatform()
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'Work with nowhere to go')
      refusing = 'flames'

      platform.pause()

      refusing = 'nothing'
      expect(loadRecentFlames()).toHaveLength(0)
      dispose()
    })

    expect(takePauseSaveFailure()).toBe(true)
    expect(takePauseSaveFailure()).toBe(false)
  })

  it('takes the complaint back when a later pause does save', () => {
    // Storage refuses, the user frees space in Data Management, and the next
    // background writes the same work. The launch after that must not still
    // claim the flame was lost: it is on the shelf, and the user has it.
    const platform = fakePlatform()
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'Work with nowhere to go')
      refusing = 'flames'
      platform.pause()

      refusing = 'nothing'
      platform.pause()

      expect(loadRecentFlames()[0]?.flame.metadata?.name).toBe(
        'Work with nowhere to go',
      )
      dispose()
    })

    expect(takePauseSaveFailure()).toBe(false)
  })

  it('is not a crash on a device with nothing left at all', () => {
    // Storage refuses the flame AND the three bytes that would say so. There
    // is nowhere to leave a message for the user, so the only thing left is
    // not to throw on the way out of the process.
    const platform = fakePlatform()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'Work with nowhere to go')
      refusing = 'everything'

      expect(() => {
        platform.pause()
      }).not.toThrow()

      refusing = 'nothing'
      dispose()
    })
    expect(takePauseSaveFailure()).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('says nothing about a pause that had nothing to write', () => {
    const platform = fakePlatform()
    createRoot((dispose) => {
      workspace()
      platform.pause()
      dispose()
    })
    expect(takePauseSaveFailure()).toBe(false)
  })
})

describe('where the next launch lands', () => {
  it('reopens the flame the pause wrote', () => {
    // The fold made the work durable, and durable is not the same as in front
    // of you: without this a force-stop returned the user to the welcome
    // screen with an hour of work sitting in the Library. The pause write
    // records which entry it made, and the launch opens that entry.
    const platform = fakePlatform()
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'An hour of work')
      platform.pause()
      dispose()
    })
    stopPauseSave()

    const reopen = reopenTarget(true)
    expect(reopen?.flame.metadata?.name).toBe('An hour of work')
    // The timeline comes back with it, or the animation resumes at the
    // workspace's defaults, 30fps over 90 frames.
    expect(reopen?.tracks?.[0]?.parameterPath).toBe(tracks[0]?.parameterPath)
    expect(reopen?.config?.fps).toBe(60)
    expect(reopen?.config?.endFrame).toBe(300)
  })

  it('keeps pointing at the last write through a pause that wrote nothing', () => {
    // Android fires pause for every share sheet, and a clean document is not
    // written. The pointer is not consumed on the way out either, so the
    // second force-stop of a session that changed nothing still comes back to
    // the same flame instead of the starter one.
    const platform = fakePlatform()
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'Written once')
      platform.pause()
      platform.pause()
      dispose()
    })
    stopPauseSave()

    expect(reopenTarget(true)?.flame.metadata?.name).toBe('Written once')
    expect(reopenTarget(true)?.flame.metadata?.name).toBe('Written once')
  })

  it('opens nothing, and raises nothing, when the entry is gone', () => {
    // The user deleted it in Library, or everything saved since pushed it off
    // the end of the list. A pointer is a convenience over work that is safe
    // without it, so there is no error here and nothing to report - the launch
    // opens what it would have opened anyway.
    const platform = fakePlatform()
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'Deleted in Library afterwards')
      platform.pause()
      dispose()
    })
    stopPauseSave()
    const id = loadRecentFlamesForRewrite()[0]?.id
    expect(id).toBeDefined()
    expect(deleteRecentFlame(id!)).toBe(true)

    expect(reopenTarget(true)).toBeUndefined()
    expect(takePauseSaveFailure()).toBe(false)
  })

  it('points at nothing when the pause could not save', () => {
    // Storage refused, so there is no entry to name. Pointing at an id that
    // was never written sends the launch either nowhere or, worse, at whatever
    // else holds it.
    const platform = fakePlatform()
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'Work with nowhere to go')
      refusing = 'flames'
      platform.pause()
      refusing = 'nothing'
      dispose()
    })
    stopPauseSave()

    expect(reopenTarget(true)).toBeUndefined()
  })

  it('does nothing on the web, where a tab gets its pagehide', () => {
    const platform = fakePlatform()
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'Open in a tab')
      platform.pause()
      dispose()
    })
    stopPauseSave()

    expect(reopenTarget(false)).toBeUndefined()
  })

  it('lets a welcome tap that gets there first win', () => {
    // The old restore held a seat, because the tap overwrote the only copy of
    // the work on its way to the editor. There is nothing to hold now: the
    // flame is an ordinary Library entry before the app comes back, so a tap
    // that beats the reopen simply takes the hand-off.
    const platform = fakePlatform()
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'What they were working on')
      platform.pause()
      dispose()
    })
    stopPauseSave()

    const seat = createWorkspaceHandoff({ enterWorkspace: () => undefined })
    const reopen = reopenTarget(true)
    expect(reopen).toBeDefined()
    seat.seed({ flame: reopen!.flame })

    // The welcome grid is live before the workspace chunk resolves.
    seat.seed({
      flame: { ...flame, metadata: { ...flame.metadata, name: 'Starter' } },
      enterWorkspace: true,
    })

    expect(seat.flame()?.metadata?.name).toBe('Starter')
    expect(
      loadRecentFlames().some(
        (entry) => entry.flame.metadata?.name === 'What they were working on',
      ),
    ).toBe(true)
  })
})

/** A crash copy as a build before the fold would have left it. */
const seedLegacyDraft = (name = 'Draft') => {
  safeSetItem(
    LEGACY_DRAFT_KEY,
    JSON.stringify({
      flame: { ...flame, metadata: { ...flame.metadata, name } },
      savedAt: Date.now(),
      animation: { tracks, config },
      sessionId: 'autosave-killed',
    }),
  )
}

describe('the slot a build before the fold left behind', () => {
  it('moves onto the shelf, and only then is forgotten', () => {
    seedLegacyDraft()

    migrateLegacyDraft()

    const recents = loadRecentFlames()
    expect(recents).toHaveLength(1)
    expect(recents[0]?.flame.metadata?.name).toBe('Draft')
    expect(recents[0]?.tracks?.[0]?.parameterPath).toBe(
      tracks[0]?.parameterPath,
    )
    expect(recents[0]?.config?.endFrame).toBe(300)
    expect(store.get(LEGACY_DRAFT_KEY)).toBeUndefined()
    // And the launch after it has nothing left to do.
    migrateLegacyDraft()
    expect(loadRecentFlames()).toHaveLength(1)
  })

  it('keeps the slot when the write did not land', () => {
    // ORDER IS THE WHOLE OF IT. At the cap, and when storage refuses, that
    // slot is still the only copy of the work: forgetting the key first would
    // delete it, so the key stays and the next launch tries again.
    for (const setUp of [
      () => {
        fillRecents()
      },
      () => {
        refusing = 'flames'
      },
    ]) {
      seedLegacyDraft()
      setUp()

      migrateLegacyDraft()

      refusing = 'nothing'
      expect(store.get(LEGACY_DRAFT_KEY)).toBeDefined()
      expect(
        loadRecentFlames().some(
          (entry) => entry.flame.metadata?.name === 'Draft',
        ),
      ).toBe(false)
      clearRecentFlames()
      store.clear()
    }
  })

  it('files it under an id of its own, over nothing', () => {
    // The envelope carries the id of the session that wrote it, and that
    // session's autosave may have written the same entry AFTER this copy -
    // the two are halves of one piece of work. Writing this over it would
    // destroy the newer half, so the migration takes a fresh place instead
    // and the user deletes the duplicate if they want to.
    safeSetItem(
      RECENTS_KEY,
      JSON.stringify([
        {
          id: 'autosave-killed',
          name: 'Newer half',
          savedAt: 9e12,
          flame: { ...flame, metadata: { ...flame.metadata, name: 'Newer' } },
        },
      ]),
    )
    seedLegacyDraft()

    migrateLegacyDraft()

    const names = loadRecentFlames().map((entry) => entry.flame.metadata?.name)
    expect(names).toContain('Newer')
    expect(names).toContain('Draft')
  })

  it('is not a crash when the value is corrupt, and does not delete it', () => {
    // The OS killed the old build mid-write. There is nothing in it to move,
    // and deleting what has not been written somewhere else is the one thing
    // this module never does.
    safeSetItem(LEGACY_DRAFT_KEY, '{"flame": nonsense')
    migrateLegacyDraft()
    expect(loadRecentFlames()).toHaveLength(0)
    expect(store.get(LEGACY_DRAFT_KEY)).toBeDefined()

    safeSetItem(LEGACY_DRAFT_KEY, '{"hello":"world"}')
    migrateLegacyDraft()
    expect(loadRecentFlames()).toHaveLength(0)
    expect(store.get(LEGACY_DRAFT_KEY)).toBeDefined()
  })
})

describe('what the user does after the crash', () => {
  it('cannot lose the work on the welcome screen or the next flame', () => {
    // THE CASE THE FOLD EXISTS TO REMOVE. The work used to be handed back to
    // the workspace as a restored draft, and then had to survive the welcome
    // grid, the seeding race behind it, and whatever the user opened next -
    // each of which lost it at least once. Now the pause write is the save:
    // by the time the app comes back, the flame is an ordinary entry in the
    // Library, and a launch that opens something else is just another load.
    const platform = fakePlatform()
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'What they were working on')
      platform.pause()
      dispose()
    })
    stopPauseSave()

    // The cold start: welcome screen up, nothing restored, nothing seeded.
    migrateLegacyDraft()
    expect(takePauseSaveFailure()).toBe(false)

    // They tap a starter flame on the welcome grid, edit it, and it autosaves
    // into an entry of its own.
    createRoot((dispose) => {
      const { autosave, setOpen } = workspace({
        ...flame,
        metadata: { ...flame.metadata, name: 'Starter' },
      })
      setOpen('metadata', 'name', 'Something else entirely')
      expect(autosave.flushDirtyToRecents()).toBe('saved')
      dispose()
    })

    const names = loadRecentFlames().map((entry) => entry.flame.metadata?.name)
    expect(names).toContain('What they were working on')
    expect(names).toContain('Something else entirely')
  })

  it('keeps it through a session that opens and saves a second flame', () => {
    // The other half of the same story: the restored work used to share one
    // entry with whatever the workspace did next, so opening a second flame
    // from Library replaced it. Two documents, two entries, and the crashed
    // session's is not the one that moves.
    const platform = fakePlatform()
    createRoot((dispose) => {
      const { setOpen } = workspace()
      setOpen('metadata', 'name', 'What they were working on')
      platform.pause()
      dispose()
    })
    stopPauseSave()

    // A second flame, opened and edited in a session of its own: a load
    // boundary, then edits, then the flush at the next replacement.
    createRoot((dispose) => {
      const { autosave, setOpen, setTracks, setConfig } = workspace({
        ...flame,
        metadata: { ...flame.metadata, name: 'Opened from Library' },
      })
      // A plain flame arrives with no animation and a timeline of its own.
      setTracks([])
      setConfig(defaultConfig())
      autosave.markLoadedBaseline()
      setOpen('metadata', 'name', 'Edited the second flame')
      expect(autosave.flushDirtyToRecents()).toBe('saved')
      dispose()
    })

    const crashed = loadRecentFlames().find(
      (entry) => entry.flame.metadata?.name === 'What they were working on',
    )
    expect(crashed).toBeDefined()
    expect(crashed?.tracks?.[0]?.parameterPath).toBe(tracks[0]?.parameterPath)
    expect(crashed?.config?.endFrame).toBe(300)
  })
})
