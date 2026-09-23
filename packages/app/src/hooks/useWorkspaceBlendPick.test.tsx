/**
 * A blend partner picked through the real gallery, wired the way the
 * workspace wires it: hover a tile and click it, then read the document, the
 * step the take recorded, a replay of that take and one undo. And the same
 * pick made without a hover, the way a touch screen makes it.
 */
import '@/commands/builtins'
import { fireEvent, render, screen } from '@solidjs/testing-library'
import { createRoot } from 'solid-js'
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
import { useWorkspaceBlendPick } from './useWorkspaceBlendPick'
import type { RecordedSession } from '@/recorder/schema'

// The tiles' thumbnails render through WebGPU; the pick does not need them.
vi.mock('@/lib/Root', () => ({ Root: () => null }))
vi.mock('@/utils/recentFlames', () => ({
  loadRecentFlames: () => [],
  formatRecentDate: () => '',
}))

/** A workspace-shaped world: the app's history with the recorder's hooks, a
 *  real command context over it, and the hook MainWorkspace uses. */
function makeWorkspace() {
  const [flame, setFlame, history] = createStoreHistory(
    createStore(deepClone(examples.example1)),
    {
      journal: true,
      onEntryPushed: reportDocumentWrite,
      onPreviewStarted: notePreviewStarted,
    },
  )
  const timeline = createTimelineState()
  const ctx = createSeatCommandContext({
    flame: () => flame,
    setFlame,
    timeline,
    history,
  })
  const blendPick = useWorkspaceBlendPick({
    flame: () => flame,
    setSilently: history.setSilently,
    execute: (id, ...args) => {
      executeCommand(id, ctx, ...args)
    },
  })
  return { flame, history, ctx, blendPick }
}

type Workspace = ReturnType<typeof makeWorkspace>

/** The gallery with the props WorkspaceSidebar gives it for a blend. */
function renderGallery(workspace: Workspace) {
  return render(() => (
    <BlendFlameGallery
      onSelect={(flame) => {
        workspace.blendPick.pick(deepClone(flame))
      }}
      onPreviewBlend={workspace.blendPick.preview}
      onClose={() => {
        workspace.blendPick.preview(null)
      }}
    />
  ))
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

  it('puts back exactly what a hover replaced when the pointer leaves', () => {
    const workspace = workspaceRoot()
    const before = plain(workspace)
    workspace.blendPick.preview(deepClone(examples.example2))
    workspace.blendPick.preview(null)
    // A document that never had a weight does not gain one.
    expect(plain(workspace)).toEqual(before)
  })
})
