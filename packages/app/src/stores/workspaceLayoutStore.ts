import { createMemo, createSignal } from 'solid-js'
import { persistentSignal } from '@/utils/persistentSignal'
import type { Accessor, Setter } from 'solid-js'

export const WIDE_LAYOUT_MIN_WIDTH = 769

export function isWideLayout(): boolean {
  if (typeof window === 'undefined') return true
  return window.innerWidth >= WIDE_LAYOUT_MIN_WIDTH
}

export interface WorkspaceLayoutStore {
  isMobile: Accessor<boolean>
  setIsMobile: Setter<boolean>

  sidebarHidden: Accessor<boolean>
  setSidebarHidden: Setter<boolean>
  showSidebar: Accessor<boolean>
  setShowSidebar: Setter<boolean>
  sidebarLayoutMode: Accessor<'compact' | 'wide'>
  setSidebarLayoutMode: (mode: 'compact' | 'wide') => void
  sidebarWidth: Accessor<number>
  sidebarEl: Accessor<HTMLDivElement | undefined>
  setSidebarEl: Setter<HTMLDivElement | undefined>

  timelineCollapsed: Accessor<boolean>
  setTimelineCollapsed: Setter<boolean>
  showTimeline: Accessor<boolean>
  setShowTimeline: Setter<boolean>

  affineCardOpen: Accessor<boolean>
  setAffineCardOpen: Setter<boolean>
  colorCardOpen: Accessor<boolean>
  setColorCardOpen: Setter<boolean>
  metadataCardOpen: Accessor<boolean>
  setMetadataCardOpen: Setter<boolean>
  paletteCardOpen: Accessor<boolean>
  setPaletteCardOpen: Setter<boolean>
  renderCardOpen: Accessor<boolean>
  setRenderCardOpen: Setter<boolean>
  symmetryCardOpen: Accessor<boolean>
  setSymmetryCardOpen: Setter<boolean>
  randomizerOpen: Accessor<boolean>
  setRandomizerOpen: Setter<boolean>
  randomizerAnimEpoch: Accessor<number>
  setRandomizerAnimEpoch: Setter<number>
  floatingActionsCollapsed: Accessor<boolean>
  setFloatingActionsCollapsed: Setter<boolean>

  floatingLeft: Accessor<number>
  floatingTop: Accessor<number>
}

export function createWorkspaceLayoutStore(
  initialWide?: boolean,
): WorkspaceLayoutStore {
  const wide = initialWide ?? isWideLayout()
  const [isMobile, setIsMobile] = createSignal(
    typeof window !== 'undefined'
      ? window.innerWidth < WIDE_LAYOUT_MIN_WIDTH
      : false,
  )
  const [sidebarHidden, setSidebarHidden] = createSignal(!wide)
  const [showSidebar, setShowSidebar] = createSignal(true)
  const [sidebarLayoutMode, setSidebarLayoutMode] = persistentSignal<
    'compact' | 'wide'
  >('sidebar-layout-mode', 'wide')
  const sidebarWidth = createMemo(() =>
    sidebarLayoutMode() === 'wide' ? 26 : 21,
  )
  const [sidebarEl, setSidebarEl] = createSignal<HTMLDivElement | undefined>()

  const [timelineCollapsed, setTimelineCollapsed] = createSignal(false)
  const [showTimeline, setShowTimeline] = createSignal(wide)

  const [affineCardOpen, setAffineCardOpen] = createSignal(true)
  const [colorCardOpen, setColorCardOpen] = createSignal(true)
  const [metadataCardOpen, setMetadataCardOpen] = createSignal(false)
  const [paletteCardOpen, setPaletteCardOpen] = createSignal(false)
  const [renderCardOpen, setRenderCardOpen] = createSignal(true)
  const [symmetryCardOpen, setSymmetryCardOpen] = createSignal(true)
  const [randomizerOpen, setRandomizerOpen] = createSignal(false)
  const [randomizerAnimEpoch, setRandomizerAnimEpoch] = createSignal(0)
  const [floatingActionsCollapsed, setFloatingActionsCollapsed] =
    createSignal(false)

  const floatingLeft = createMemo(() => {
    if (typeof document === 'undefined') return 26 * 16 + 8
    const rootFontSize = parseFloat(
      // eslint-disable-next-line no-restricted-globals
      getComputedStyle(document.documentElement).fontSize || '16',
    )
    return sidebarWidth() * rootFontSize + 8
  })
  const floatingTop = createMemo(() => 8)

  return {
    isMobile,
    setIsMobile,
    sidebarHidden,
    setSidebarHidden,
    showSidebar,
    setShowSidebar,
    sidebarLayoutMode,
    setSidebarLayoutMode,
    sidebarWidth,
    sidebarEl,
    setSidebarEl,
    timelineCollapsed,
    setTimelineCollapsed,
    showTimeline,
    setShowTimeline,
    affineCardOpen,
    setAffineCardOpen,
    colorCardOpen,
    setColorCardOpen,
    metadataCardOpen,
    setMetadataCardOpen,
    paletteCardOpen,
    setPaletteCardOpen,
    renderCardOpen,
    setRenderCardOpen,
    symmetryCardOpen,
    setSymmetryCardOpen,
    randomizerOpen,
    setRandomizerOpen,
    randomizerAnimEpoch,
    setRandomizerAnimEpoch,
    floatingActionsCollapsed,
    setFloatingActionsCollapsed,
    floatingLeft,
    floatingTop,
  }
}
