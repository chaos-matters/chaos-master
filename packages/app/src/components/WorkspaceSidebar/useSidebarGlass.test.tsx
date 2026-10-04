/**
 * When the desktop sidebar floats over the canvas as glass, and the leading
 * cover it writes for the canvas box and the camera (useSidebarGlass.ts): the
 * sidebar's width less the 0.4rem the setting-off canvas already runs under
 * it, whenever it floats, and 0 whenever it does not - hidden, unmounted,
 * the setting off, the light theme or a mobile width. Over a duel's stage it
 * still floats, but its surface stays opaque.
 */
import { render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeContextProvider, useTheme } from '@/contexts/ThemeContext'
import { CANVAS_RESIZE_DEBOUNCE_MS } from '@/defaults'
import { leadingCover } from '@/lib/canvasFraming'
import { setGlassPanels } from '@/lib/glass'
import { CANVAS_TUCK_REM, useSidebarGlass } from './useSidebarGlass'
import type { SidebarGlass } from './useSidebarGlass'
import type { Theme } from '@/contexts/ThemeContext'

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []

  readonly observe = vi.fn()
  readonly disconnect = vi.fn()

  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this)
  }

  /** What the browser does when the observed box changes size. */
  resize() {
    this.callback([], this as unknown as ResizeObserver)
  }
}

/** The 0.4rem tuck at the test DOM's 16 px root font size. */
const TUCK_PX = CANVAS_TUCK_REM * 16

/** A sidebar laid out `width` px wide, as the test DOM cannot. */
function sidebarElement(width: number) {
  const element = document.createElement('div')
  let current = width
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, current, 1080),
  )
  return {
    element,
    resize(next: number) {
      current = next
    },
  }
}

function mount(width = 416) {
  const sidebar = sidebarElement(width)
  const [shown, setShown] = createSignal(true)
  const [isMobile, setIsMobile] = createSignal(false)
  const [overDuel, setOverDuel] = createSignal(false)
  const [element, setElement] = createSignal<HTMLElement | undefined>(
    sidebar.element,
  )
  let glass: SidebarGlass | undefined
  let setTheme: ((theme: Theme) => void) | undefined

  function Probe() {
    setTheme = useTheme().setTheme
    glass = useSidebarGlass({ element, shown, isMobile, overDuel })
    return null
  }
  const view = render(() => (
    <ThemeContextProvider>
      <Probe />
    </ThemeContextProvider>
  ))
  return {
    ...view,
    glass: glass!,
    setTheme: setTheme!,
    sidebar,
    setShown,
    setIsMobile,
    setOverDuel,
    setElement,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  setGlassPanels(true)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setGlassPanels(true)
  delete document.body.dataset.theme
  try {
    localStorage.removeItem('cm-ui-theme')
  } catch {
    // The runner's storage may not be writable; then nothing was stored.
  }
})

describe('the glass desktop sidebar', () => {
  it('floats over the canvas as glass with the setting on, dark', () => {
    const { glass, unmount } = mount(416)

    expect(glass.floats()).toBe(true)
    expect(glass.glass()).toBe(true)
    // The wide sidebar, 26rem, less the tuck: 409.6 px.
    expect(leadingCover()).toBeCloseTo(416 - TUCK_PX, 6)
    unmount()
  })

  it('covers nothing and is not glass with the setting off', () => {
    const { glass, unmount } = mount()

    setGlassPanels(false)
    expect(glass.floats()).toBe(false)
    expect(glass.glass()).toBe(false)
    expect(leadingCover()).toBe(0)

    setGlassPanels(true)
    expect(leadingCover()).toBeCloseTo(416 - TUCK_PX, 6)
    unmount()
  })

  it('covers nothing in the light theme, as the gate has it', () => {
    const { glass, setTheme, unmount } = mount()

    setTheme('light')
    expect(glass.floats()).toBe(false)
    expect(leadingCover()).toBe(0)

    setTheme('dark')
    expect(glass.floats()).toBe(true)
    expect(leadingCover()).toBeCloseTo(416 - TUCK_PX, 6)
    unmount()
  })

  it('covers nothing while hidden, and nothing at a mobile width', () => {
    const { glass, setShown, setIsMobile, unmount } = mount()

    setShown(false)
    expect(glass.floats()).toBe(false)
    expect(leadingCover()).toBe(0)
    setShown(true)
    expect(leadingCover()).toBeCloseTo(416 - TUCK_PX, 6)

    setIsMobile(true)
    expect(glass.floats()).toBe(false)
    expect(leadingCover()).toBe(0)
    unmount()
  })

  it('follows the sidebar from wide to compact, and stops watching it', () => {
    const { sidebar, setShown, unmount } = mount(416)
    const observer = FakeResizeObserver.instances.at(-1)!
    expect(observer.observe).toHaveBeenCalledWith(sidebar.element, {
      box: 'border-box',
    })

    // 21rem.
    sidebar.resize(336)
    observer.resize()
    vi.advanceTimersByTime(CANVAS_RESIZE_DEBOUNCE_MS)
    expect(leadingCover()).toBeCloseTo(336 - TUCK_PX, 6)

    setShown(false)
    expect(observer.disconnect).toHaveBeenCalled()
    unmount()
  })

  it('lands a resize with the canvas, not on every frame of a drag', () => {
    // Dragging the window's edge below 1200 px resizes the fluid sidebar
    // every frame. Each new cover would shift the camera and restart the
    // flame's accumulation, so it waits for the drag to settle, as the
    // canvas's own size does (useElementSize.ts), and the two land together.
    const { sidebar, unmount } = mount(400)
    const observer = FakeResizeObserver.instances.at(-1)!

    for (const width of [396, 390, 384, 378]) {
      sidebar.resize(width)
      observer.resize()
      vi.advanceTimersByTime(16)
      expect(leadingCover()).toBeCloseTo(400 - TUCK_PX, 6)
    }
    vi.advanceTimersByTime(CANVAS_RESIZE_DEBOUNCE_MS - 17)
    expect(leadingCover()).toBeCloseTo(400 - TUCK_PX, 6)
    vi.advanceTimersByTime(1)
    expect(leadingCover()).toBeCloseTo(378 - TUCK_PX, 6)
    unmount()
  })

  it('docks at once, and a resize still waiting does not float it again', () => {
    const { sidebar, setTheme, unmount } = mount(416)
    const observer = FakeResizeObserver.instances.at(-1)!

    sidebar.resize(336)
    observer.resize()
    setTheme('light')
    expect(leadingCover()).toBe(0)
    vi.advanceTimersByTime(CANVAS_RESIZE_DEBOUNCE_MS)
    expect(leadingCover()).toBe(0)

    // Floating again is at once too, so the box spans the column in the
    // same frame.
    setTheme('dark')
    expect(leadingCover()).toBeCloseTo(336 - TUCK_PX, 6)
    unmount()
  })

  it('waits for the sidebar to be mounted', () => {
    const { setElement, sidebar, unmount } = mount()

    setElement(undefined)
    expect(leadingCover()).toBe(0)
    setElement(sidebar.element)
    expect(leadingCover()).toBeCloseTo(416 - TUCK_PX, 6)
    unmount()
  })

  it('stays opaque over a duel, still floating', () => {
    const { glass, setOverDuel, unmount } = mount()

    setOverDuel(true)
    expect(glass.floats()).toBe(true)
    expect(glass.glass()).toBe(false)
    expect(leadingCover()).toBeCloseTo(416 - TUCK_PX, 6)
    unmount()
  })

  it('takes its cover with it when it unmounts', () => {
    const { unmount } = mount()
    expect(leadingCover()).toBeGreaterThan(0)

    unmount()
    expect(leadingCover()).toBe(0)
  })
})
