/**
 * The partner gallery as the sidebar routes it, for the picks that open a view
 * instead of committing a partner: Evolve opens the evolution chamber, Diff
 * the comparison. Both used to leave the 40% hover preview in the document, a
 * blend nobody picked that no undo reaches and no take recorded. And the ways
 * out that bypass the gallery's own close button, which the sidebar owns.
 *
 * The world is the one MainWorkspace builds: the app's history with the
 * recorder's hooks, a real command context, the blend pick hook, and the real
 * sidebar and gallery on top.
 */
import '@/commands/builtins'
import { fireEvent, render, screen } from '@solidjs/testing-library'
import { createRoot, createSignal } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeCommand, executeReplayCommand } from '@/commands/registry'
import { DEFAULT_BLEND_WEIGHT } from '@/flame/blend'
import { examples } from '@/flame/examples'
import { useWorkspaceBlendPick } from '@/hooks/useWorkspaceBlendPick'
import { setActiveTab } from '@/lib/activeTab'
import { cancelSessionRecording, notePreviewStarted, reportDocumentWrite, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { replaySessionInstant } from '@/recorder/replay'
import { createSeatCommandContext } from '@/seats/seat'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { createTimelineState } from '@/utils/timeline'
import { WorkspaceSidebar } from './WorkspaceSidebar'
import type { WorkspaceSidebarProps } from './WorkspaceSidebar'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { RecordedSession } from '@/recorder/schema'

// The tiles' thumbnails render through WebGPU; the picks do not need them.
vi.mock('@/lib/Root', () => ({ Root: () => null }))
vi.mock('@/utils/recentFlames', () => ({
  loadRecentFlames: () => [],
  formatRecentDate: () => '',
}))
// What the sidebar shows once the gallery is gone. The editor sections and the
// comparison are views of the document; these tests read the document itself.
vi.mock('./AffineEditorSection', () => ({ AffineEditorSection: () => null }))
vi.mock('./ColorAndPaletteSection', () => ({
  ColorAndPaletteSection: () => null,
}))
vi.mock('./CustomVariationsSection', () => ({
  CustomVariationsSection: () => null,
}))
vi.mock('./RandomizerSection', () => ({ RandomizerSection: () => null }))
vi.mock('./RenderSettingsSection', () => ({
  RenderSettingsSection: () => null,
}))
vi.mock('./TransformsSection', () => ({ TransformsSection: () => null }))
vi.mock('@/components/DiffViewModal/DiffViewModal', () => ({
  DiffViewContent: () => null,
}))

type Intent = 'blend' | 'evolve' | 'diff'

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

const plain = (workspace: Workspace) => deepClone(unwrap(workspace.flame))

/**
 * The sidebar showing the gallery for `intent`, wired as MainWorkspace wires
 * it. `opened` holds what each view was handed as the current flame, read at
 * the moment it opened.
 */
function renderSidebar(workspace: Workspace, intent: Intent) {
  const [showSidebar, setShowSidebar] = createSignal(true)
  const [showBlendGallery, setShowBlendGallery] = createSignal(true)
  const [diffView, setDiffView] = createSignal<{
    flameA: FlameDescriptor
    flameB: FlameDescriptor
  } | null>(null)
  const opened: { view: 'evolve' | 'diff'; flame: FlameDescriptor }[] = []
  const requestModal = vi.fn(() => {
    opened.push({ view: 'evolve', flame: plain(workspace) })
    return new Promise<never>(() => {})
  })
  const props: Partial<WorkspaceSidebarProps> = {
    showSidebar,
    isPlaying: () => false,
    sidebarHidden: () => false,
    setSidebarHidden: () => {},
    duelShowing: () => false,
    duelSidebarOpen: () => false,
    sidebarWidth: () => 20,
    sideBarResizable: false,
    animationExportRunning: () => false,
    animationExportCancel: () => undefined,
    isMobile: () => false,
    sidebarDiffView: diffView,
    closeSidebarDiff: () => setDiffView(null),
    showBlendGallery,
    setShowBlendGallery,
    showAudioPanel: () => false,
    showSonificationPanel: () => false,
    blendIntent: () => intent,
    breedPreviewChild: () => undefined,
    endBreedPreview: () => {},
    _requestModal: requestModal,
    showToast: () => {},
    blendFlame: () => undefined,
    // MainWorkspace `handlePreviewBlend` for every intent but breed.
    handlePreviewBlend: (flame) => {
      if (flame === null) workspace.blendPick.end()
      else workspace.blendPick.preview(flame)
    },
    setHoveredBlendName: () => {},
    commitBlendPick: workspace.blendPick.pick,
    openDiffView: (flameA, flameB) => {
      opened.push({ view: 'diff', flame: deepClone(unwrap(flameA)) })
      setDiffView({ flameA: deepClone(flameA), flameB: deepClone(flameB) })
    },
    quickPickState: () => null,
    history: {},
    affineSectionProps: {} as WorkspaceSidebarProps['affineSectionProps'],
    colorAndPaletteSectionProps:
      {} as WorkspaceSidebarProps['colorAndPaletteSectionProps'],
    customVariationsSectionProps:
      {} as WorkspaceSidebarProps['customVariationsSectionProps'],
    randomizerSectionProps:
      {} as WorkspaceSidebarProps['randomizerSectionProps'],
    transformsSectionProps:
      {} as WorkspaceSidebarProps['transformsSectionProps'],
    renderSettingsSectionProps: {
      flameDescriptor: workspace.flame,
    } as WorkspaceSidebarProps['renderSettingsSectionProps'],
  }
  const view = render(() => (
    <WorkspaceSidebar {...(props as WorkspaceSidebarProps)} />
  ))
  return { ...view, opened, showBlendGallery, setShowSidebar }
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

function stopTake(): RecordedSession {
  const session = stopSessionRecording()
  if (!session) throw new Error('expected a finished take')
  return session
}

/** The world lives in a root of its own and the sidebar is rendered outside
 *  it, as in useWorkspaceBlendPick.test.tsx: inside a root, Solid runs the
 *  rendered tree's effects only once the root's own function returns. */
let disposeWorld: (() => void) | undefined

function workspaceRoot(): Workspace {
  return createRoot((dispose) => {
    disposeWorld = dispose
    return makeWorkspace()
  })
}

afterEach(() => {
  setActiveTab('workspace')
  cancelSessionRecording()
  disposeWorld?.()
  disposeWorld = undefined
})

describe.each(['evolve', 'diff'] as const)(
  'the %s pick, made from a hovered tile',
  (intent) => {
    it('opens on the document before the hover and leaves it, and its undo, as they were', () => {
      const workspace = workspaceRoot()
      const before = plain(workspace)
      startSessionRecording(workspace.flame)
      const { opened, showBlendGallery, unmount } = renderSidebar(
        workspace,
        intent,
      )
      const partner = tile('example2')

      fireEvent.mouseEnter(partner)
      // The hover shows the blend, silently.
      expect(workspace.flame.renderSettings.blendWeight).toBe(
        DEFAULT_BLEND_WEIGHT,
      )
      fireEvent.click(partner)
      const session = stopTake()

      expect(showBlendGallery()).toBe(false)
      // The view was given the flame the user has, not the one they hovered.
      expect(opened).toEqual([{ view: intent, flame: before }])
      expect(plain(workspace)).toEqual(before)
      expect(workspace.history.hasUndo()).toBe(false)
      // Nothing happened to the document, and the take says exactly that.
      expect(session.actions).toEqual([])
      expect(session.unnamedWriteCount).toBe(0)
      expect(plain(replayInto(session))).toEqual(plain(workspace))
      unmount()
    })
  },
)

describe('the gallery left without its close button', () => {
  it('puts the document back when the sidebar closes under the pointer', () => {
    // F and Ctrl+S close the sidebar with the gallery still "open": it comes
    // back when the sidebar does, but the preview must not wait for that.
    const workspace = workspaceRoot()
    const before = plain(workspace)
    startSessionRecording(workspace.flame)
    const { setShowSidebar, showBlendGallery, unmount } = renderSidebar(
      workspace,
      'blend',
    )

    fireEvent.mouseEnter(tile('example2'))
    setShowSidebar(false)
    const session = stopTake()

    expect(showBlendGallery()).toBe(true)
    expect(plain(workspace)).toEqual(before)
    expect(workspace.history.hasUndo()).toBe(false)
    expect(session.unnamedWriteCount).toBe(0)
    expect(plain(replayInto(session))).toEqual(plain(workspace))
    unmount()
  })

  it.each(['home', 'arcade'] as const)(
    'puts the document back when %s covers the workspace under the pointer',
    (tab) => {
      // The workspace stays mounted under Home and the Arcade, gallery and
      // all, and the back button or a link switches to them with the pointer
      // held still: no tile is left, so nothing else would end the preview.
      const workspace = workspaceRoot()
      const before = plain(workspace)
      startSessionRecording(workspace.flame)
      const { unmount } = renderSidebar(workspace, 'blend')

      fireEvent.mouseEnter(tile('example2'))
      setActiveTab(tab)
      const session = stopTake()

      expect(plain(workspace)).toEqual(before)
      expect(workspace.history.hasUndo()).toBe(false)
      expect(session.unnamedWriteCount).toBe(0)
      expect(plain(replayInto(session))).toEqual(plain(workspace))
      unmount()
    },
  )
})
