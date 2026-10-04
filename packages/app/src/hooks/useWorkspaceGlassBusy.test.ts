/**
 * The glass busy switch: which states of the editor canvas put
 * data-glass="busy" on <html>, that it comes off again afterwards, and that
 * an edit on its own - a tap, or the canvas converging after a change - never
 * flickers the panels solid.
 */
import { createRoot, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAnimationExportRunning } from '@/flame/renderStats'
import { setDeckResizing } from '@/lib/canvasFraming'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { GLASS_BUSY_SETTLE_MS, isCanvasBusy, useWorkspaceGlassBusy, } from './useWorkspaceGlassBusy'

const IDLE = {
  playing: false,
  exporting: false,
  audioModulating: false,
  dragging: false,
  resizing: false,
}

const busyAttribute = () => document.documentElement.getAttribute('data-glass')

describe('isCanvasBusy', () => {
  it('is idle when nothing presents a frame of its own', () => {
    expect(isCanvasBusy(IDLE)).toBe(false)
  })

  it.each([
    'playing',
    'exporting',
    'audioModulating',
    'dragging',
    'resizing',
  ] as const)('is busy on %s alone', (state) => {
    expect(isCanvasBusy({ ...IDLE, [state]: true })).toBe(true)
  })
})

describe('useWorkspaceGlassBusy', () => {
  let dispose = () => {}

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    dispose()
    setAnimationExportRunning(false)
    setDeckResizing(false)
    vi.useRealTimers()
    delete document.documentElement.dataset.glass
  })

  function mount() {
    const [playing, setPlaying] = createSignal(false)
    const [exportImage, setExportImage] = createSignal<
      (() => void) | undefined
    >()
    const [audioModulating, setAudioModulating] = createSignal(false)
    const [, set, history] = createStoreHistory(createStore({ vibrancy: 0.2 }))
    createRoot((rootDispose) => {
      dispose = rootDispose
      useWorkspaceGlassBusy({
        timeline: { isPlaying: playing },
        history,
        exportStore: { onExportImage: exportImage },
        audioModulating,
      })
    })
    return { setPlaying, setExportImage, setAudioModulating, set, history }
  }

  it('goes busy once playback has held for the settle time, and back after', () => {
    const editor = mount()

    editor.setPlaying(true)
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS - 1)
    expect(busyAttribute()).toBeNull()
    vi.advanceTimersByTime(1)
    expect(busyAttribute()).toBe('busy')

    editor.setPlaying(false)
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS - 1)
    expect(busyAttribute()).toBe('busy')
    vi.advanceTimersByTime(1)
    expect(busyAttribute()).toBeNull()
  })

  it('is busy for the whole of a drag, and not while the edit converges', () => {
    const editor = mount()

    editor.history.startPreview('Edit vibrancy')
    editor.set((draft) => {
      draft.vibrancy = 0.6
    })
    vi.advanceTimersByTime(400)
    expect(busyAttribute()).toBe('busy')

    // The release: the history closes and the canvas goes on converging on
    // the new value for a while, which is not busy.
    editor.history.commit()
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS)
    expect(busyAttribute()).toBeNull()
    vi.advanceTimersByTime(5000)
    expect(busyAttribute()).toBeNull()
  })

  it('never flickers solid for a tap', () => {
    const editor = mount()

    editor.history.startPreview('Edit vibrancy')
    editor.set((draft) => {
      draft.vibrancy = 0.4
    })
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS / 2)
    expect(busyAttribute()).toBeNull()
    editor.history.commit()
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS * 4)

    expect(busyAttribute()).toBeNull()
  })

  it('stays busy across the gap between two drags', () => {
    const editor = mount()

    editor.history.startPreview('Edit vibrancy')
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS * 2)
    editor.history.commit()
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS / 2)
    editor.history.startPreview('Edit vibrancy')
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS * 2)

    expect(busyAttribute()).toBe('busy')
  })

  it('is busy while a still or an animation exports', () => {
    const editor = mount()

    editor.setExportImage(() => () => {})
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS)
    expect(busyAttribute()).toBe('busy')
    editor.setExportImage(undefined)
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS)
    expect(busyAttribute()).toBeNull()

    setAnimationExportRunning(true)
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS)
    expect(busyAttribute()).toBe('busy')
    setAnimationExportRunning(false)
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS)
    expect(busyAttribute()).toBeNull()
  })

  it('is busy while audio modulation runs', () => {
    const editor = mount()

    editor.setAudioModulating(true)
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS)
    expect(busyAttribute()).toBe('busy')
    editor.setAudioModulating(false)
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS)
    expect(busyAttribute()).toBeNull()
  })

  it("is busy while the deck's divider is dragged", () => {
    // Each step of the drag resizes the canvas beside the deck, or reframes
    // the one under it, so the canvas presents every frame of it.
    mount()

    setDeckResizing(true)
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS)
    expect(busyAttribute()).toBe('busy')
    setDeckResizing(false)
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS)
    expect(busyAttribute()).toBeNull()
  })

  it('takes the attribute down with the workspace', () => {
    const editor = mount()
    editor.setPlaying(true)
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS)
    expect(busyAttribute()).toBe('busy')

    dispose()
    expect(busyAttribute()).toBeNull()
    vi.advanceTimersByTime(GLASS_BUSY_SETTLE_MS * 4)
    expect(busyAttribute()).toBeNull()
  })
})
