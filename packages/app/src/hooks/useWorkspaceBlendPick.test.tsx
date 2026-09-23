/**
 * A blend partner picked through the real gallery, wired the way the
 * workspace wires it: hover a tile and click it, then read the document, the
 * step the take recorded, a replay of that take and one undo. And the same
 * pick made without a hover, the way a touch screen makes it.
 *
 * Then the hover itself, against everything that can happen under a pointer
 * resting on a tile: an undo or a redo, a load or a replay replacing the
 * document, and the gallery switching to another picker. Its preview is
 * written into the document silently, so whatever goes wrong with it goes
 * wrong where no undo reaches.
 */
import '@/commands/builtins'
import { fireEvent, render, screen } from '@solidjs/testing-library'
import { createRoot, createSignal } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeCommand, executeReplayCommand } from '@/commands/registry'
import { BlendFlameGallery } from '@/components/BlendFlameGallery/BlendFlameGallery'
import { DEFAULT_BLEND_WEIGHT } from '@/flame/blend'
import { examples } from '@/flame/examples'
import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { cancelSessionRecording, notePreviewStarted, reportDocumentWrite, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { replaySessionInstant } from '@/recorder/replay'
import { createSeatCommandContext } from '@/seats/seat'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { createTimelineState } from '@/utils/timeline'
import { BREED_PREVIEW_DELAY_MS, useWorkspaceBlendPick, } from './useWorkspaceBlendPick'
import type { BlendIntent } from './useWorkspaceBlendPick'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { RecordedSession } from '@/recorder/schema'

// The tiles' thumbnails render through WebGPU; the pick does not need them.
vi.mock('@/lib/Root', () => ({ Root: () => null }))
vi.mock('@/utils/recentFlames', () => ({
  loadRecentFlames: () => [],
  formatRecentDate: () => '',
}))

/** A workspace-shaped world: the app's history with the recorder's hooks, a
 *  real command context over it, and the hook MainWorkspace uses, told which
 *  picker the gallery serves and ended before every undo and redo the way
 *  MainWorkspace ends it (galleryPreviewWiring.test.ts holds it to that). */
function makeWorkspace() {
  let endPreview = () => {}
  const [flame, setFlame, history] = createStoreHistory(
    createStore(deepClone(examples.example1)),
    {
      journal: true,
      onEntryPushed: reportDocumentWrite,
      onPreviewStarted: notePreviewStarted,
      onBeforeTimeTravel: () => {
        endPreview()
      },
    },
  )
  const timeline = createTimelineState()
  const ctx = createSeatCommandContext({
    flame: () => flame,
    setFlame,
    timeline,
    history,
  })
  const [intent, setIntent] = createSignal<BlendIntent>('blend')
  const blendPick = useWorkspaceBlendPick({
    flame: () => flame,
    setSilently: history.setSilently,
    execute: (id, ...args) => {
      executeCommand(id, ctx, ...args)
    },
    intent,
  })
  endPreview = () => {
    blendPick.end()
  }
  return { flame, history, ctx, blendPick, setIntent }
}

type Workspace = ReturnType<typeof makeWorkspace>

/** The gallery with the props WorkspaceSidebar gives it for a blend. */
function renderGallery(
  workspace: Workspace,
  onPreviewName?: (name: string | null) => void,
) {
  return render(() => (
    <BlendFlameGallery
      onSelect={(flame) => {
        workspace.blendPick.pick(deepClone(flame))
      }}
      onPreviewBlend={workspace.blendPick.preview}
      onPreviewName={onPreviewName}
      onClose={() => {
        workspace.blendPick.preview(null)
      }}
    />
  ))
}

/** The page going to the background: another browser tab, another app. */
function hidePage(): () => void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  })
  document.dispatchEvent(new Event('visibilitychange'))
  return () => {
    Reflect.deleteProperty(document, 'visibilityState')
  }
}

function tile(name: string): HTMLElement {
  fireEvent.input(screen.getByPlaceholderText('Filter by name...'), {
    target: { value: name },
  })
  return screen.getByTitle(name)
}

function replayInto(session: RecordedSession): Workspace {
  const other = createRoot(() => makeWorkspace())
  replaySessionInstant(session, {
    loadInitial: (flame) => {
      other.history.replace(flame, 'Replay: initial state')
    },
    execute: (id, args) => executeReplayCommand(id, other.ctx, ...args),
  })
  return other
}

const plain = (workspace: Workspace) => deepClone(unwrap(workspace.flame))

/** The world lives in a root of its own, and the gallery is rendered outside
 *  it: inside a root, Solid runs the rendered tree's effects only once the
 *  root's own function returns, which is after every assertion here. */
let disposeWorld: (() => void) | undefined

function workspaceRoot(): Workspace {
  return createRoot((dispose) => {
    disposeWorld = dispose
    return makeWorkspace()
  })
}

afterEach(() => {
  cancelSessionRecording()
  disposeWorld?.()
  disposeWorld = undefined
})

describe('a blend partner picked in the gallery', () => {
  it('commits the weight its preview showed, replays to it, and undoes to the document before the hover', () => {
    const workspace = workspaceRoot()
    const before = plain(workspace)
    startSessionRecording(workspace.flame)
    const { unmount } = renderGallery(workspace)
    const partner = tile('example2')

    fireEvent.mouseEnter(partner)
    // The hover shows the blend and is not an edit.
    expect(workspace.flame.renderSettings.blendWeight).toBe(
      DEFAULT_BLEND_WEIGHT,
    )
    expect(workspace.history.hasUndo()).toBe(false)

    fireEvent.click(partner)
    const session = stopSessionRecording()
    if (!session) throw new Error('expected a finished take')

    expect(workspace.flame.renderSettings.blendWeight).toBe(
      DEFAULT_BLEND_WEIGHT,
    )
    expect(deepClone(workspace.flame.renderSettings.blendFlame)).toEqual(
      tryValidateFlame(deepClone(examples.example2)),
    )
    expect(session.actions.map(({ id, args }) => [id, args.slice(1)])).toEqual([
      ['flame.setBlendFlame', [DEFAULT_BLEND_WEIGHT]],
    ])
    expect(session.unnamedWriteCount).toBe(0)

    // The replay lands on the blend the viewer saw.
    expect(plain(replayInto(session))).toEqual(plain(workspace))

    // One undo is the document from before the hover: partner and weight.
    workspace.history.undo()
    expect(plain(workspace)).toEqual(before)
    unmount()
  })

  it('gives a pick made without a hover, as on a touch screen, the same weight', () => {
    const workspace = workspaceRoot()
    const before = plain(workspace)
    startSessionRecording(workspace.flame)
    const { unmount } = renderGallery(workspace)

    fireEvent.click(tile('example2'))
    const session = stopSessionRecording()
    if (!session) throw new Error('expected a finished take')

    expect(workspace.flame.renderSettings.blendWeight).toBe(
      DEFAULT_BLEND_WEIGHT,
    )
    expect(session.actions.map(({ id, args }) => [id, args.slice(1)])).toEqual([
      ['flame.setBlendFlame', [DEFAULT_BLEND_WEIGHT]],
    ])
    expect(plain(replayInto(session))).toEqual(plain(workspace))
    workspace.history.undo()
    expect(plain(workspace)).toEqual(before)
    unmount()
  })

  it('undoes a morph set up from a hovered partner to the document before the hover', () => {
    // The morph picker previews through the same hook and commits its own
    // command, which sets the partner at full weight; MainWorkspace's
    // setupMorph runs that command inside `commit`.
    const workspace = workspaceRoot()
    const before = plain(workspace)
    workspace.blendPick.preview(deepClone(examples.example2))
    workspace.blendPick.commit(() => {
      executeCommand(
        'flame.setupMorph',
        workspace.ctx,
        deepClone(examples.example2),
      )
    })
    expect(workspace.flame.renderSettings.blendWeight).toBe(1)
    workspace.history.undo()
    expect(plain(workspace)).toEqual(before)
  })

  it('puts back the pick, not the document before it, when a later hover leaves', () => {
    // The gallery opened again after a pick: a hover over another tile, then
    // the pointer leaves the tiles.
    const workspace = workspaceRoot()
    workspace.blendPick.preview(deepClone(examples.example2))
    workspace.blendPick.pick(deepClone(examples.example2))
    const picked = plain(workspace)
    workspace.blendPick.preview(deepClone(examples.example3))
    workspace.blendPick.preview(null)
    expect(plain(workspace)).toEqual(picked)
  })

  it('puts the document back when the gallery goes away under the pointer', () => {
    // Closing the sidebar (F, Ctrl+S), another panel taking its place, the
    // Home hand-off: all of them remove the gallery while a tile may still be
    // hovered, and none of them goes through its close button. The pointer
    // never leaves the tile, so only the gallery going away can end it.
    const workspace = workspaceRoot()
    const before = plain(workspace)
    const names: (string | null)[] = []
    startSessionRecording(workspace.flame)
    const { unmount } = renderGallery(workspace, (name) => names.push(name))

    fireEvent.mouseEnter(tile('example2'))
    expect(workspace.flame.renderSettings.blendWeight).toBe(
      DEFAULT_BLEND_WEIGHT,
    )
    unmount()
    const session = stopSessionRecording()
    if (!session) throw new Error('expected a finished take')

    expect(plain(workspace)).toEqual(before)
    expect(workspace.history.hasUndo()).toBe(false)
    expect(names.at(-1)).toBeNull()
    expect(session.unnamedWriteCount).toBe(0)
    expect(plain(replayInto(session))).toEqual(plain(workspace))
  })

  it('puts the document back when the page is hidden mid-hover', () => {
    // A tab switch fires no pointer event at all, and a hidden page is where
    // the autosave interval and the pagehide flush keep writing the document.
    const workspace = workspaceRoot()
    const before = plain(workspace)
    const { unmount } = renderGallery(workspace)
    fireEvent.mouseEnter(tile('example2'))

    const showPage = hidePage()
    try {
      expect(plain(workspace)).toEqual(before)
      expect(workspace.history.hasUndo()).toBe(false)
    } finally {
      showPage()
      unmount()
    }
  })

  it('puts back exactly what a hover replaced when the pointer leaves', () => {
    const workspace = workspaceRoot()
    const before = plain(workspace)
    workspace.blendPick.preview(deepClone(examples.example2))
    workspace.blendPick.preview(null)
    // A document that never had a weight does not gain one.
    expect(plain(workspace)).toEqual(before)
  })
})

/** A flame carrying a partner of its own, the way a load or a take's initial
 *  state can arrive. */
function blendedWith(
  base: FlameDescriptor,
  partner: FlameDescriptor,
  weight: number,
): FlameDescriptor {
  const flame = deepClone(base)
  flame.renderSettings.blendFlame = deepClone(partner)
  flame.renderSettings.blendWeight = weight
  return flame
}

describe('an undo or a redo under a hovered tile', () => {
  it('ends the preview first, so the undo lands on the document before the hover', () => {
    const workspace = workspaceRoot()
    const before = plain(workspace)
    executeCommand('flame.setExposure', workspace.ctx, 0.8)

    workspace.blendPick.preview(deepClone(examples.example2))
    workspace.history.undo()

    // Not the undone document with the hover still written into it.
    expect(plain(workspace)).toEqual(before)
    workspace.blendPick.preview(null)
    expect(plain(workspace)).toEqual(before)
  })

  it('never puts an undone partner back when the pointer then leaves', () => {
    const workspace = workspaceRoot()
    workspace.blendPick.pick(deepClone(examples.example2))
    const picked = plain(workspace)
    executeCommand('flame.setBlendWeight', workspace.ctx, 0.3)

    workspace.blendPick.preview(deepClone(examples.example3))
    workspace.history.undo()
    workspace.blendPick.preview(null)

    expect(plain(workspace)).toEqual(picked)
  })

  it('keeps a redone partner when the pointer then leaves', () => {
    const workspace = workspaceRoot()
    workspace.blendPick.pick(deepClone(examples.example2))
    const picked = plain(workspace)
    workspace.history.undo()

    workspace.blendPick.preview(deepClone(examples.example3))
    workspace.history.redo()
    workspace.blendPick.preview(null)

    expect(plain(workspace)).toEqual(picked)
  })
})

describe('a document replaced under a hovered tile', () => {
  it('is not overwritten with the blend from before the hover when the pointer leaves', () => {
    const workspace = workspaceRoot()
    workspace.blendPick.pick(deepClone(examples.example2))
    workspace.blendPick.preview(deepClone(examples.example3))

    workspace.history.replace(deepClone(examples.example4), 'Load flame')
    const loaded = plain(workspace)
    workspace.blendPick.preview(null)

    expect(plain(workspace)).toEqual(loaded)
  })

  it('is not overwritten either after the pointer moves on to another tile', () => {
    const workspace = workspaceRoot()
    workspace.blendPick.pick(deepClone(examples.example2))
    workspace.blendPick.preview(deepClone(examples.example3))
    workspace.history.replace(deepClone(examples.example4), 'Load flame')
    const loaded = plain(workspace)

    workspace.blendPick.preview(deepClone(examples.example5))
    workspace.blendPick.preview(null)

    expect(plain(workspace)).toEqual(loaded)
  })

  it('keeps the partner a replay started with', () => {
    const workspace = workspaceRoot()
    workspace.blendPick.pick(deepClone(examples.example2))
    workspace.blendPick.preview(deepClone(examples.example3))

    workspace.history.replace(
      blendedWith(examples.example4, examples.example5, 0.7),
      'Replay: initial state',
    )
    const initial = plain(workspace)
    workspace.blendPick.preview(null)

    expect(plain(workspace)).toEqual(initial)
  })

  it('is not overwritten by the flame a breed preview replaced', () => {
    vi.useFakeTimers()
    try {
      const workspace = workspaceRoot()
      workspace.setIntent('breed')
      workspace.blendPick.preview(deepClone(examples.example2))
      vi.advanceTimersByTime(BREED_PREVIEW_DELAY_MS)
      expect(workspace.blendPick.breedChild()).toBeDefined()

      workspace.history.replace(deepClone(examples.example4), 'Load flame')
      const loaded = plain(workspace)
      workspace.blendPick.preview(null)

      expect(plain(workspace)).toEqual(loaded)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('a hover in Evolve and Diff', () => {
  it.each(['evolve', 'diff'] as const)(
    'writes nothing into the document for %s, and still names the tile',
    (intent) => {
      const workspace = workspaceRoot()
      workspace.setIntent(intent)
      const before = plain(workspace)
      const names: (string | null)[] = []
      const { unmount } = renderGallery(workspace, (name) => names.push(name))

      fireEvent.mouseEnter(tile('example2'))

      expect(plain(workspace)).toEqual(before)
      expect(names).toEqual(['example2'])
      unmount()
      expect(plain(workspace)).toEqual(before)
    },
  )

  it('ends a blend preview left by a quick switch from another picker', () => {
    const workspace = workspaceRoot()
    const before = plain(workspace)
    workspace.blendPick.preview(deepClone(examples.example2))

    workspace.setIntent('evolve')
    workspace.blendPick.preview(deepClone(examples.example3))

    expect(plain(workspace)).toEqual(before)
  })
})

describe('Breed after a quick switch', () => {
  it('leaves no blend inside parent A, nor in the child it previews', () => {
    // Hover a tile as a blend, leave, and switch to Breed inside the
    // gallery's 120 ms clear delay: the next hover arrives before the blend
    // preview was ever ended.
    vi.useFakeTimers()
    try {
      const workspace = workspaceRoot()
      const before = plain(workspace)
      const { unmount } = renderGallery(workspace)
      const first = tile('example2')
      fireEvent.mouseEnter(first)
      fireEvent.mouseLeave(first)
      vi.advanceTimersByTime(60)

      workspace.setIntent('breed')
      fireEvent.mouseEnter(tile('example3'))
      vi.advanceTimersByTime(BREED_PREVIEW_DELAY_MS)

      const child = workspace.blendPick.breedChild()
      expect(child).toBeDefined()
      expect(child?.renderSettings.blendFlame).toBeUndefined()
      expect(workspace.flame.renderSettings.blendFlame).toBeUndefined()

      // What the sidebar hands the breed gallery as parent A.
      workspace.blendPick.end()
      expect(plain(workspace)).toEqual(before)
      unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the badge over the canvas', () => {
  // The gallery's order: the preview first, then the tile's name.
  /** A 3D flame in the workspace: blending renders nothing there. */
  const in3D = (workspace: Workspace) => {
    workspace.history.replace(deepClone(examples.example36), 'Load flame')
  }

  it('names a blend partner while its preview is on the canvas', () => {
    const workspace = workspaceRoot()
    workspace.blendPick.preview(deepClone(examples.example2))
    workspace.blendPick.name('example2')
    expect(workspace.blendPick.badge()).toBe('example2')

    workspace.blendPick.preview(null)
    expect(workspace.blendPick.badge()).toBeNull()
  })

  it.each(['blend', 'morph'] as const)(
    'names nothing for %s in 3D, where the hover writes nothing',
    (intent) => {
      const workspace = workspaceRoot()
      workspace.setIntent(intent)
      in3D(workspace)
      const before = plain(workspace)
      workspace.blendPick.preview(deepClone(examples.example2))
      expect(plain(workspace)).toEqual(before)

      workspace.blendPick.name('example2')
      expect(workspace.blendPick.badge()).toBeNull()
    },
  )

  it('ends the last preview when the next tile is a 3D flame', () => {
    const workspace = workspaceRoot()
    const before = plain(workspace)
    workspace.blendPick.preview(deepClone(examples.example2))
    const flame3D = deepClone(examples.example3)
    flame3D.renderSettings.dimensions = 3
    workspace.blendPick.preview(flame3D)
    workspace.blendPick.name('example3')

    expect(plain(workspace)).toEqual(before)
    expect(workspace.blendPick.badge()).toBeNull()
  })

  it('names a breed partner once its child is on the canvas, in 3D too', () => {
    vi.useFakeTimers()
    try {
      const workspace = workspaceRoot()
      workspace.setIntent('breed')
      in3D(workspace)
      workspace.blendPick.preview(deepClone(examples.example41))
      workspace.blendPick.name('example41')
      expect(workspace.blendPick.badge()).toBeNull()

      vi.advanceTimersByTime(BREED_PREVIEW_DELAY_MS)
      expect(workspace.blendPick.badge()).toBe('example41')
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(['evolve', 'diff'] as const)(
    'names the %s tile, whose badge says what a click does',
    (intent) => {
      const workspace = workspaceRoot()
      workspace.setIntent(intent)
      workspace.blendPick.preview(deepClone(examples.example2))
      workspace.blendPick.name('example2')
      expect(workspace.blendPick.badge()).toBe('example2')
    },
  )
})
