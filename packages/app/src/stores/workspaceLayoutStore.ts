import { createMemo, createRoot, createSignal } from 'solid-js'
import { persistentSignal } from '@/utils/persistentSignal'
import type { Accessor, Setter } from 'solid-js'

export const WIDE_LAYOUT_MIN_WIDTH = 769
export const PHONE_MAX_WIDTH = 680
export const TABLET_MAX_WIDTH = 1024

export function isWideLayout(): boolean {
  if (typeof window === 'undefined') return true
  return window.innerWidth >= WIDE_LAYOUT_MIN_WIDTH
}

export function isPhoneLayout(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth < PHONE_MAX_WIDTH
}

export function isTabletLayout(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.innerWidth >= PHONE_MAX_WIDTH &&
    window.innerWidth <= TABLET_MAX_WIDTH
  )
}

export type TouchLayoutPreference = 'auto' | 'touch' | 'desktop'

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as
    | (Navigator & { msMaxTouchPoints?: number })
    | undefined
  return (
    'ontouchstart' in window ||
    (typeof nav !== 'undefined' &&
      ((nav.maxTouchPoints ?? 0) > 0 || (nav.msMaxTouchPoints ?? 0) > 0)) ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches)
  )
}

export interface WorkspaceLayoutStore {
  touchLayoutPreference: Accessor<TouchLayoutPreference>
  setTouchLayoutPreference: (pref: TouchLayoutPreference) => void
  isMobile: Accessor<boolean>
  setIsMobile: Setter<boolean>
  isPhone: Accessor<boolean>
  setIsPhone: Setter<boolean>
  isTablet: Accessor<boolean>
  setIsTablet: Setter<boolean>
  isTouchLayout: Accessor<boolean>

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

const [touchLayoutPreference, setTouchLayoutPreference] =
  persistentSignal<TouchLayoutPreference>('chaos-touch-layout-pref', 'auto')

const [rawIsPhone, setRawIsPhone] = createSignal(
  typeof window !== 'undefined' ? window.innerWidth < PHONE_MAX_WIDTH : false,
)
const [rawIsTablet, setRawIsTablet] = createSignal(
  typeof window !== 'undefined'
    ? window.innerWidth >= PHONE_MAX_WIDTH &&
        window.innerWidth <= TABLET_MAX_WIDTH
    : false,
)

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mqPhone = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH - 0.02}px)`)
  const mqTablet = window.matchMedia(
    `(min-width: ${PHONE_MAX_WIDTH}px) and (max-width: ${TABLET_MAX_WIDTH}px)`,
  )
  mqPhone.addEventListener?.('change', (e) => setRawIsPhone(e.matches))
  mqTablet.addEventListener?.('change', (e) => setRawIsTablet(e.matches))
}

/**
 * Device classification outlives every component, so these memos are
 * deliberately global. `createRoot` makes that explicit and gives them an owner;
 * at module scope they were created outside any root and Solid warned, on every
 * page load, that they would never be disposed. The root is never disposed on
 * purpose, so its dispose function is discarded.
 */
const { isPhone, isTablet, isTouchLayout } = createRoot(() => {
  const isPhone = createMemo(() => {
    if (touchLayoutPreference() === 'desktop') return false
    return rawIsPhone()
  })
  const isTablet = createMemo(() => {
    if (touchLayoutPreference() === 'desktop') return false
    if (touchLayoutPreference() === 'touch') return !rawIsPhone()
    return rawIsTablet()
  })
  const isTouchLayout = createMemo(() => isPhone() || isTablet())
  return { isPhone, isTablet, isTouchLayout }
})

export {
  isPhone,
  isTablet,
  isTouchLayout,
  touchLayoutPreference,
  setTouchLayoutPreference,
  setRawIsPhone as setIsPhone,
  setRawIsTablet as setIsTablet,
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
    touchLayoutPreference,
    setTouchLayoutPreference,
    isMobile,
    setIsMobile,
    isPhone,
    setIsPhone: setRawIsPhone,
    isTablet,
    setIsTablet: setRawIsTablet,
    isTouchLayout,
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
