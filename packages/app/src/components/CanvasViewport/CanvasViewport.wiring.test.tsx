/**
 * CanvasViewport's wiring to what draws the canvas: the cameras take the
 * framing's view shift, beside the deck and the sidebar and above the rail's
 * glass sheet, and Flam3 takes the export hook cut to the part on show and
 * the edge fade for what covers the canvas, on the 2D path and the 3D one
 * alike. The framing test mocks the canvas away; here it renders,
 * with the cameras and Flam3 standing in as probes that keep the props they
 * were given.
 */
import { cleanup, render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { setLeadingCover, setTrailingCover } from '@/lib/canvasFraming'
import { setGlassPanels } from '@/lib/glass'
import { CanvasViewport, EDGE_FADE_COLOR } from './CanvasViewport'
import type { JSXElement } from 'solid-js'
import type { CanvasViewportProps } from './CanvasViewport'
import type { ExportImageType } from '@/flame/exportImageType'
import type { ViewShift } from '@/lib/canvasFraming'

interface CameraProps {
  viewShift: () => ViewShift
  children: JSXElement
}

/** What the probes kept of the props they were given. */
interface Seen {
  camera2D?: CameraProps
  camera3D?: CameraProps
  flam3?: {
    onExportImage?: ExportImageType
    edgeFadeColor: { x: number; y: number; z: number; w: number }
  }
}

const seen = vi.hoisted<Seen>(() => ({}))

vi.mock('@/lib/AutoCanvas', () => ({
  AutoCanvas: (props: { children: JSXElement }) => props.children,
}))
vi.mock('@/lib/WheelZoomCamera2D', () => ({
  WheelZoomCamera2D: (props: CameraProps) => {
    seen.camera2D = props
    return props.children
  },
}))
vi.mock('@/lib/WheelZoomCamera3D', () => ({
  WheelZoomCamera3D: (props: CameraProps) => {
    seen.camera3D = props
    return props.children
  },
}))
vi.mock('@/flame/Flam3', () => ({
  Flam3: (props: NonNullable<typeof seen.flam3>) => {
    seen.flam3 = props
    return null
  },
}))
vi.mock('@/components/ExportJobs/ExportJobHost', () => ({
  ExportJobHost: () => null,
}))
vi.mock('@/components/ExportJobs/ExportJobTracker', () => ({
  ExportJobTracker: () => null,
}))
vi.mock('@/components/ProgressBar/ProgressBar', () => ({
  ProgressBar: () => null,
}))
// The same 1100 x 820 canvas box as the framing test's tablet.
vi.mock('@/utils/useElementSize', () => ({
  useElementSize: () => () => ({
    width: 1100,
    height: 820,
    widthPX: 1100,
    heightPX: 820,
  }),
}))

/** A 380 px deck over the 1100 px canvas. */
const COVERED = 380 / 1100
/** 200 px of it under the glass sidebar. */
const COVERED_LEFT = 200 / 1100
/** Px of the 820 px canvas the rail's sheet covers above peek: a quarter. */
const SHEET = 205

const flat = examples.example1
const deep = {
  ...flat,
  renderSettings: { ...flat.renderSettings, dimensions: 3 as const },
}

function mountViewport(
  effectiveFlame: typeof flat = flat,
  capture?: ExportImageType,
  railInset: number | (() => number) = 0,
) {
  const props = {
    railInset: typeof railInset === 'function' ? railInset : () => railInset,
    isMobile: () => false,
    showSidebar: () => true,
    onCanvasClick: () => {},
    onToggleMobileSidebar: () => {},
    flameDescriptor: flat,
    effectiveFlame: () => effectiveFlame,
    hoveredVariationType: () => null,
    hoveredCustomVarDef: () => null,
    hoveredBlendName: () => null,
    blendIntent: () => 'blend',
    exportDimensions: () => undefined,
    onExportImage: () => capture,
    theme: () => 'dark',
    canvasPixelRatio: () => 1,
  }
  render(() => (
    <CanvasViewport {...(props as unknown as CanvasViewportProps)} />
  ))
}

afterEach(() => {
  setTrailingCover(0)
  setLeadingCover(0)
  setGlassPanels(true)
  vi.unstubAllGlobals()
  cleanup()
  delete seen.camera2D
  delete seen.camera3D
  delete seen.flam3
})

describe('the cameras', () => {
  it('take the shift that frames the flame beside what covers the canvas', () => {
    mountViewport()
    expect(seen.camera2D?.viewShift()).toEqual({ x: 0, y: 0 })

    setTrailingCover(380)
    expect(seen.camera2D?.viewShift().x).toBeCloseTo(-COVERED)
    expect(seen.camera2D?.viewShift().y).toBe(0)

    setTrailingCover(0)
    setLeadingCover(200)
    expect(seen.camera2D?.viewShift().x).toBeCloseTo(COVERED_LEFT)
  })

  it('give a 3D flame the same shift', () => {
    setTrailingCover(380)
    mountViewport(deep)

    expect(seen.camera2D).toBeUndefined()
    expect(seen.camera3D?.viewShift().x).toBeCloseTo(-COVERED)
  })

  it("take the shift that frames the flame above the rail's glass sheet", () => {
    // Half the 205 px the sheet covers, 102.5 of the canvas's 410 px
    // half-height: the slide the opaque sheet gives the canvas instead.
    mountViewport(flat, undefined, SHEET)
    expect(seen.camera2D?.viewShift()).toEqual({ x: 0, y: 0.25 })
    cleanup()

    mountViewport(deep, undefined, SHEET)
    expect(seen.camera3D?.viewShift()).toEqual({ x: 0, y: 0.25 })
  })

  it("take no shift for the rail's opaque sheet, which slides the canvas", () => {
    setGlassPanels(false)
    mountViewport(flat, undefined, SHEET)
    expect(seen.camera2D?.viewShift()).toEqual({ x: 0, y: 0 })
  })

  it('move with the sheet to a new detent, not ahead of it', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    )
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const runFrame = (now: number) => {
      for (const callback of frames.splice(0)) callback(now)
    }
    const [railInset, setRailInset] = createSignal(0)
    mountViewport(flat, undefined, railInset)

    setRailInset(SHEET)
    expect(seen.camera2D?.viewShift().y).toBe(0)
    runFrame(0)
    runFrame(70)
    const partWay = seen.camera2D?.viewShift().y ?? 0
    expect(partWay).toBeGreaterThan(0)
    expect(partWay).toBeLessThan(0.25)
    runFrame(280)
    expect(seen.camera2D?.viewShift()).toEqual({ x: 0, y: 0.25 })
  })
})

describe.each([
  ['a flat flame', flat],
  ['a 3D flame', deep],
])('Flam3, for %s,', (_, flame) => {
  it('takes the capture through the cut to the part on show', () => {
    const capture = vi.fn<ExportImageType>()
    mountViewport(flame, capture)

    const handed = seen.flam3?.onExportImage
    // Wrapped, not the capture itself, so what leaves the canvas is cut.
    expect(handed).toBeTypeOf('function')
    expect(handed).not.toBe(capture)
    // With nothing covered the cut is the whole canvas: the capture sees the
    // canvas it would have seen without the framing.
    const canvas = document.createElement('canvas')
    const info = { finalImageReady: true }
    handed?.(canvas, info)
    expect(capture).toHaveBeenCalledWith(canvas, info)
  })

  it('takes no capture when nothing waits for one', () => {
    mountViewport(flame)
    expect(seen.flam3?.onExportImage).toBeUndefined()
  })

  it('fades the edge beside the sidebar, and not while the deck covers it', () => {
    mountViewport(flame)
    expect(seen.flam3?.edgeFadeColor).toBe(EDGE_FADE_COLOR.dark)

    setTrailingCover(380)
    const fade = seen.flam3?.edgeFadeColor
    expect([fade?.x, fade?.y, fade?.z, fade?.w]).toEqual([0, 0, 0, 0])
  })

  it("does not fade it while the rail's glass sheet covers the canvas's foot", () => {
    mountViewport(flame, undefined, SHEET)
    const fade = seen.flam3?.edgeFadeColor
    expect([fade?.x, fade?.y, fade?.z, fade?.w]).toEqual([0, 0, 0, 0])
  })
})
