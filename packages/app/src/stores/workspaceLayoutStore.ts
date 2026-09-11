import { createMemo, createRoot, createSignal } from 'solid-js'
import { IS_NATIVE } from '@/lib/platform'
import { persistentSignal } from '@/utils/persistentSignal'
import type { Accessor, Setter } from 'solid-js'

export const WIDE_LAYOUT_MIN_WIDTH = 769
export const PHONE_MAX_WIDTH = 680
export const TABLET_MAX_WIDTH = 1024

export function isWideLayout(): boolean {
  if (typeof window === 'undefined') return true
  return window.innerWidth >= WIDE_LAYOUT_MIN_WIDTH
}

export type TouchLayoutPreference = 'auto' | 'touch' | 'desktop'

export type LayoutClass = 'phone' | 'tablet' | 'desktop'

export interface LayoutInput {
  readonly width: number
  readonly height: number
  /**
   * The screen's short edge in CSS px. The window's short edge is not usable
   * here: `interactive-widget=resizes-content` and Android's IME insets shrink
   * the window when the soft keyboard opens, and a screen does not rotate
   * under a keyboard.
   */
  readonly shortEdge: number
  /** `(pointer: coarse)`: the primary pointer is a finger. */
  readonly coarse: boolean
  /** The Capacitor app. */
  readonly native: boolean
  readonly preference: TouchLayoutPreference
}

/** A screen whose short edge is under this is a phone, in any orientation. */
export const COMPACT_MAX_SHORT_EDGE = PHONE_MAX_WIDTH
/** Below this width a tablet uses the phone rail on its bigger canvas. */
export const DECK_MIN_WIDTH = 900

/**
 * Which workspace to build. A device (the native app, or a coarse pointer on
 * the web) is a phone or a tablet, decided by the short edge so a rotated
 * phone stays a phone and an iPad in landscape stays a tablet; it never gets
 * the desktop sidebar. A fine pointer on the web keeps the width rules the
 * web has always had.
 */
export function classifyLayout(input: LayoutInput): LayoutClass {
  if (input.preference === 'desktop') return 'desktop'
  const device = input.native || input.coarse
  if (device || input.preference === 'touch') {
    // A device is measured by its screen: the soft keyboard shrinks the
    // window, and a tablet that reclassified as a phone would unmount the
    // deck together with the input the user is typing into. A desktop browser
    // put into the touch layout by hand keeps the window measure, because its
    // window is a fraction of the screen it sits on.
    const shortEdge = device
      ? input.shortEdge
      : Math.min(input.width, input.height)
    return shortEdge < COMPACT_MAX_SHORT_EDGE ? 'phone' : 'tablet'
  }
  if (input.width < PHONE_MAX_WIDTH) return 'phone'
  if (input.width <= TABLET_MAX_WIDTH) return 'tablet'
  return 'desktop'
}

export function deckFitsWidth(width: number): boolean {
  return width >= DECK_MIN_WIDTH
}

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
  isTablet: Accessor<boolean>
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

/**
 * The short edge of the screen the window sits on, in CSS px. Only a device
 * is classified by it (`classifyLayout`): on a desktop the screen says
 * nothing about the size of the window. Where there is no usable screen the
 * window is the honest measure.
 */
export function screenShortEdge(): number {
  if (typeof window === 'undefined') return 768
  const windowShort = Math.min(window.innerWidth, window.innerHeight)
  const screen: Screen | undefined = window.screen
  if (!screen) return windowShort
  const screenShort = Math.min(screen.width, screen.height)
  return Number.isFinite(screenShort) && screenShort > 0
    ? screenShort
    : windowShort
}

const readWindow = () => ({
  width: typeof window === 'undefined' ? 1024 : window.innerWidth,
  height: typeof window === 'undefined' ? 768 : window.innerHeight,
  shortEdge: screenShortEdge(),
})

const [viewport, setViewport] = createSignal(readWindow())
const [coarsePointer, setCoarsePointer] = createSignal(
  typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches,
)

if (typeof window !== 'undefined') {
  // One listener; the class is derived, so a rotation or a Split View
  // resize re-routes without a reload.
  window.addEventListener('resize', () => setViewport(readWindow()))
  if (typeof window.matchMedia === 'function') {
    window
      .matchMedia('(pointer: coarse)')
      .addEventListener?.('change', (e) => setCoarsePointer(e.matches))
  }
}

/**
 * Device classification outlives every component, so these memos are
 * deliberately global. `createRoot` makes that explicit and gives them an
 * owner; at module scope they were created outside any root and Solid warned,
 * on every page load, that they would never be disposed. The root is never
 * disposed on purpose, so its dispose function is discarded.
 */
const {
  viewportWidth,
  layoutClass,
  isPhone,
  isTablet,
  isTouchLayout,
  deckFits,
} = createRoot(() => {
  const viewportWidth = createMemo(() => viewport().width)
  const layoutClass = createMemo<LayoutClass>(() =>
    classifyLayout({
      ...viewport(),
      coarse: coarsePointer(),
      native: IS_NATIVE,
      preference: touchLayoutPreference(),
    }),
  )
  const isPhone = createMemo(() => layoutClass() === 'phone')
  const isTablet = createMemo(() => layoutClass() === 'tablet')
  const isTouchLayout = createMemo(() => isPhone() || isTablet())
  /** The tablet shows the side deck; below the threshold it uses the phone rail. */
  const deckFits = createMemo(
    () => isTablet() && deckFitsWidth(viewportWidth()),
  )
  return {
    viewportWidth,
    layoutClass,
    isPhone,
    isTablet,
    isTouchLayout,
    deckFits,
  }
})

export {
  viewportWidth,
  layoutClass,
  isPhone,
  isTablet,
  isTouchLayout,
  deckFits,
  touchLayoutPreference,
  setTouchLayoutPreference,
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
    isTablet,
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
