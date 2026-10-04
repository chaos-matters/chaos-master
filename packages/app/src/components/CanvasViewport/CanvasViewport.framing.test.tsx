/**
 * What the canvas viewport does with the part of the canvas that chrome
 * floating over it covers (lib/canvasFraming.ts), the tablet deck at the
 * trailing edge, the glass desktop sidebar at the leading one and the rail's
 * glass sheet at the bottom, besides the camera's shift
 * (CanvasViewport.wiring.test.tsx).
 *
 * The edge fade goes while any of them floats over the canvas: the canvas's
 * rim is under the glass there, and the fade laid a dark band down it (a
 * light one in the light theme) that the setting-off page never had. The box
 * carries the side shares as --covered-left and --covered-right, so the
 * hover badge centres on the part on show instead of on the whole canvas
 * (App.module.css). The rail's opaque sheet slides the canvas up instead,
 * through --rail-inset, and the glass one leaves it where it is.
 */
import { cleanup, render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { NOT_COVERED, setLeadingCover, setTrailingCover, } from '@/lib/canvasFraming'
import { setGlassPanels } from '@/lib/glass'
import { CanvasViewport, EDGE_FADE_COLOR, edgeFadeColor, NO_EDGE_FADE, } from './CanvasViewport'
import type { CanvasViewportProps } from './CanvasViewport'
import type { ExportDimensions } from '@/utils/exportDimensions'

// The canvas and the export tracker need WebGPU; the box does not.
vi.mock('@/lib/AutoCanvas', () => ({ AutoCanvas: () => null }))
vi.mock('@/components/ExportJobs/ExportJobHost', () => ({
  ExportJobHost: () => null,
}))
vi.mock('@/components/ExportJobs/ExportJobTracker', () => ({
  ExportJobTracker: () => null,
}))
vi.mock('@/components/ProgressBar/ProgressBar', () => ({
  ProgressBar: () => null,
}))
// A 1180 x 820 landscape tablet: a 1100 px canvas box beside the rail. The
// test DOM lays nothing out, so the box's size is given.
vi.mock('@/utils/useElementSize', () => ({
  useElementSize: () => () => ({
    width: 1100,
    height: 820,
    widthPX: 1100,
    heightPX: 820,
  }),
}))

/** A 380 px deck over a 1100 px canvas. */
const COVERED = 380 / 1100
/** 200 px of the same canvas under the glass sidebar. */
const COVERED_LEFT = 200 / 1100

const channels = (colour: { x: number; y: number; z: number; w: number }) => [
  colour.x,
  colour.y,
  colour.z,
  colour.w,
]

function mountViewport(
  railInset = 0,
  exportDimensions: () => ExportDimensions | undefined = () => undefined,
) {
  const props = {
    railInset: () => railInset,
    isMobile: () => false,
    showSidebar: () => true,
    onCanvasClick: () => {},
    onToggleMobileSidebar: () => {},
    flameDescriptor: examples.example1,
    effectiveFlame: () => examples.example1,
    hoveredVariationType: () => null,
    hoveredCustomVarDef: () => null,
    hoveredBlendName: () => null,
    blendIntent: () => 'blend',
    exportDimensions,
    onExportImage: () => undefined,
    theme: () => 'dark',
  }
  const { container } = render(() => (
    <CanvasViewport {...(props as unknown as CanvasViewportProps)} />
  ))
  return container.querySelector<HTMLElement>('[data-tour-target="canvas"]')!
}

afterEach(() => {
  setTrailingCover(0)
  setLeadingCover(0)
  setGlassPanels(true)
  cleanup()
})

describe('the edge fade', () => {
  it("is the theme's beside the sidebar with nothing over the canvas", () => {
    expect(edgeFadeColor('dark', true, NOT_COVERED)).toBe(EDGE_FADE_COLOR.dark)
    expect(edgeFadeColor('light', true, NOT_COVERED)).toBe(
      EDGE_FADE_COLOR.light,
    )
  })

  it('is off in full screen, as it always was', () => {
    expect(channels(edgeFadeColor('dark', false, NOT_COVERED))).toEqual([
      0, 0, 0, 0,
    ])
  })

  it('is off while the deck floats open over the canvas', () => {
    const deck = { left: 0, right: COVERED, bottom: 0 }
    expect(channels(edgeFadeColor('dark', true, deck))).toEqual([0, 0, 0, 0])
    expect(channels(edgeFadeColor('light', true, deck))).toEqual([0, 0, 0, 0])
  })

  it("is off while the rail's glass sheet covers the canvas's foot", () => {
    // The canvas's lower rim is under the glass there, and the light theme's
    // fade ran a pale band across the art behind the sheet.
    const sheet = { left: 0, right: 0, bottom: 275 / 844 }
    expect(channels(edgeFadeColor('light', true, sheet))).toEqual([0, 0, 0, 0])
    expect(channels(edgeFadeColor('dark', true, sheet))).toEqual([0, 0, 0, 0])
  })

  it('is off while the glass sidebar floats over the canvas', () => {
    const sidebar = { left: COVERED_LEFT, right: 0, bottom: 0 }
    expect(channels(edgeFadeColor('dark', true, sidebar))).toEqual([0, 0, 0, 0])
  })

  it('is one value whenever it is off, so a new share writes no uniform', () => {
    // The memo over it compares by identity: a fresh zero on each change of
    // the covered shares, which the rail sheet eases every frame, would
    // rewrite the renderer's uniform each time for the same colour.
    const sheet = (share: number) => ({ left: 0, right: 0, bottom: share })
    expect(edgeFadeColor('dark', true, sheet(0.1))).toBe(NO_EDGE_FADE)
    expect(edgeFadeColor('dark', true, sheet(0.2))).toBe(NO_EDGE_FADE)
    expect(edgeFadeColor('light', false, NOT_COVERED)).toBe(NO_EDGE_FADE)
  })
})

describe('the covered share on the canvas box', () => {
  it('is there while the deck covers part of the canvas', () => {
    setTrailingCover(380)
    const box = mountViewport()

    expect(Number(box.style.getPropertyValue('--covered-right'))).toBeCloseTo(
      COVERED,
    )
  })

  it('is absent with nothing over the canvas, as before there was any', () => {
    const box = mountViewport()

    expect(box.style.getPropertyValue('--covered-right')).toBe('')
  })

  it("carries the sidebar's share at the leading edge", () => {
    const box = mountViewport()

    setLeadingCover(200)
    expect(Number(box.style.getPropertyValue('--covered-left'))).toBeCloseTo(
      COVERED_LEFT,
    )
    expect(box.style.getPropertyValue('--covered-right')).toBe('')
    setLeadingCover(0)
    expect(box.style.getPropertyValue('--covered-left')).toBe('')
  })

  it('follows the deck as it opens and closes', () => {
    const box = mountViewport()

    setTrailingCover(380)
    expect(Number(box.style.getPropertyValue('--covered-right'))).toBeCloseTo(
      COVERED,
    )
    setTrailingCover(0)
    expect(box.style.getPropertyValue('--covered-right')).toBe('')
  })
})

describe('an export that sizes the canvas under the glass sidebar', () => {
  // Render in background off: the canvas renders the export's own frame,
  // with the aspect of the part on show, while the box spans the sidebar's
  // column too. App.module.css draws the canvas in the part on show while
  // the box says so (sidebarGlass.module.test.ts holds that rule).
  it('marks the box for as long as it runs', () => {
    const [dimensions, setDimensions] = createSignal<
      ExportDimensions | undefined
    >()
    setLeadingCover(200)
    const box = mountViewport(0, dimensions)
    expect(box.classList.contains('exporting')).toBe(false)

    setDimensions({ width: 1800, height: 1640 })
    expect(box.classList.contains('exporting')).toBe(true)
    // The layout does not move: the box still spans the column.
    expect(box.classList.contains('underSidebar')).toBe(true)
    expect(box.style.getPropertyValue('--leading-cover')).toBe('200px')

    setDimensions(undefined)
    expect(box.classList.contains('exporting')).toBe(false)
  })

  it('leaves the box alone with no glass sidebar over the canvas', () => {
    const box = mountViewport(0, () => ({ width: 1800, height: 1640 }))
    expect(box.classList.contains('exporting')).toBe(false)
  })
})

describe("the canvas under the rail's sheet", () => {
  // Px the sheet covers above peek at medium on a phone.
  const SHEET = 240

  it('stays where it is under the glass sheet, which the camera frames above', () => {
    // No slide, so no strip of the box at its foot: the canvas runs on under
    // the glass and the camera shifts the flame up instead.
    expect(mountViewport(SHEET).style.getPropertyValue('--rail-inset')).toBe(
      '0px',
    )
  })

  it('slides up by half the cover under the opaque sheet, as it always did', () => {
    setGlassPanels(false)
    expect(mountViewport(SHEET).style.getPropertyValue('--rail-inset')).toBe(
      '240px',
    )
  })

  it('slides when the setting goes off with the sheet open, and back', () => {
    const box = mountViewport(SHEET)
    setGlassPanels(false)
    expect(box.style.getPropertyValue('--rail-inset')).toBe('240px')
    setGlassPanels(true)
    expect(box.style.getPropertyValue('--rail-inset')).toBe('0px')
  })

  it('does not slide at peek', () => {
    expect(mountViewport(0).style.getPropertyValue('--rail-inset')).toBe('0px')
    cleanup()
    setGlassPanels(false)
    expect(mountViewport(0).style.getPropertyValue('--rail-inset')).toBe('0px')
  })
})
