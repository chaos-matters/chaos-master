/**
 * The renderer's reference state machine, driven frame by frame over a fake
 * GPU and a fake orbit worker, with the timers and the clock faked: when a
 * reference is asked for and adopted, that a pan keeps it and a deep zoom
 * replaces it while it stands in, that a late orbit is ignored, that a
 * refused upload stops iterating, and how a lost step is recovered from.
 */
import { panView, referenceSpecFor } from '@chaos-master/core'
import { cleanup, render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultPalettes } from '@/flame/palettes'
import { useCanvas } from '@/lib/CanvasContext'
import { useLiveRootContext } from '@/lib/RootContext'
import { createExplorerGpu } from './explorerGpu'
import { ExplorerRenderer } from './ExplorerRenderer'
import { createOrbitClient } from './orbitClient'
import type { ExplorerTarget } from '@chaos-master/core'
import type { ExplorerGpu } from './explorerGpu'
import type { ExplorerScene, ExplorerStatus } from './ExplorerRenderer'
import type { IterationSetup, StepResult } from './explorerTypes'
import type { OrbitResult } from './orbitClient'
import type { GpuOrbit, OrbitRequest } from './orbitProtocol'

vi.mock('./explorerGpu', () => ({
  PALETTE_SIZE: 256,
  createExplorerGpu: vi.fn(),
}))
vi.mock('./orbitClient', () => ({ createOrbitClient: vi.fn() }))
vi.mock('@/lib/CanvasContext', () => ({ useCanvas: vi.fn() }))
vi.mock('@/lib/RootContext', () => ({ useLiveRootContext: vi.fn() }))

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve: (value: T) => void
  reject: (cause: Error) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle
    reject = fail
  })
  return { promise, resolve, reject }
}

/** A GPU whose steps finish only when the test says so. */
function fakeGpu() {
  const steps: Deferred<StepResult | undefined>[] = []
  const gpu = {
    maxPixels: () => 1 << 24,
    maxOrbitEntries: () => 1 << 24,
    uploadOrbits: vi.fn(() => Promise.resolve<string | undefined>(undefined)),
    restart: vi.fn(),
    resample: vi.fn(),
    accumulate: vi.fn(),
    step: vi.fn((_budget: number, _context?: GPUCanvasContext) => {
      const done = deferred<StepResult | undefined>()
      steps.push(done)
      return done.promise
    }),
    recolour: vi.fn(),
    present: vi.fn(),
    displayDrawn: () => false,
    setColour: vi.fn(),
    setPalette: vi.fn(),
    readDisplay: vi.fn(),
    readPixels: vi.fn(),
    destroy: vi.fn(),
    hasOrbits: () => true,
  }
  return { gpu, steps }
}

/** An orbit worker whose answers the test gives, request by request. */
function fakeOrbits() {
  const requests: Deferred<OrbitResult | undefined>[] = []
  const client = {
    request: vi.fn((_request: Omit<OrbitRequest, 'id'>) => {
      const done = deferred<OrbitResult | undefined>()
      requests.push(done)
      return done.promise
    }),
    dispose: vi.fn(),
    cancel: vi.fn(),
  }
  return { client, requests }
}

function orbitResult(): OrbitResult {
  const main: GpuOrbit = {
    data: new ArrayBuffer(16),
    length: 1,
    escaped: false,
    bla: {
      data: new ArrayBuffer(32),
      levels: [],
      minLevel: 3,
      start: 1,
      entryCount: 0,
    },
  }
  return { set: { main }, ms: 12 }
}

const SIZE = { width: 800, height: 600 }

const SCENE: ExplorerScene = {
  kind: 'mandelbrot',
  view: { centerRe: '-0.75', centerIm: '0.1', zoomLog2: 20 },
  juliaC: { re: '-0.8', im: '0.156' },
  maxIterations: 1000,
}

function targetOf(scene: ExplorerScene): ExplorerTarget {
  return { ...scene, ...SIZE }
}

const context = { label: 'canvas context' } as unknown as GPUCanvasContext

let frames: FrameRequestCallback[] = []

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function mount(initial: ExplorerScene = SCENE) {
  const { gpu, steps } = fakeGpu()
  const orbits = fakeOrbits()
  vi.mocked(createExplorerGpu).mockReturnValue(gpu as unknown as ExplorerGpu)
  vi.mocked(createOrbitClient).mockReturnValue(orbits.client)
  vi.mocked(useCanvas).mockReturnValue({
    canvas: document.createElement('canvas'),
    context,
    canvasFormat: 'bgra8unorm',
    canvasSize: () => SIZE,
    pixelRatio: () => 1,
  })
  vi.mocked(useLiveRootContext).mockReturnValue(
    {} as unknown as ReturnType<typeof useLiveRootContext>,
  )
  const [scene, setScene] = createSignal(initial)
  const statuses: ExplorerStatus[] = []
  render(() => (
    <ExplorerRenderer
      scene={scene}
      setView={() => undefined}
      colour={() => ({
        period: 64,
        phase: 0,
        relief: 0.5,
        interior: [0, 0, 0],
        background: [0, 0, 0],
      })}
      palette={() => defaultPalettes[0]!}
      pixelCap={() => 1 << 24}
      samples={() => 1}
      onStatus={(status) => statuses.push(status)}
    />
  ))

  /** Run the pending animation frame at `now`. */
  const frame = (now: number) => {
    frames.shift()!(now)
  }
  /** Let answered promises and zero-delay timers run. */
  const settle = () => vi.advanceTimersByTimeAsync(0)
  const lastSetup = () => gpu.restart.mock.lastCall![0] as IterationSetup
  const budgets = () => gpu.step.mock.calls.map(([budget]) => budget)
  const move = (view: ExplorerScene['view']) => {
    setScene((s) => ({ ...s, view }))
  }
  /** The first frame, and the orbit it asks for, answered and adopted. */
  const adopt = async () => {
    frame(1000)
    orbits.requests[0]!.resolve(orbitResult())
    await settle()
  }
  return {
    gpu,
    steps,
    orbits,
    scene,
    statuses,
    frame,
    settle,
    lastSetup,
    budgets,
    move,
    adopt,
  }
}

describe('ExplorerRenderer references', () => {
  it('asks for the reference of the first view, and does not step without it', () => {
    const r = mount()
    r.frame(1000)
    expect(r.orbits.client.request).toHaveBeenCalledOnce()
    expect(r.orbits.client.request).toHaveBeenCalledWith(
      referenceSpecFor(targetOf(SCENE)),
    )
    expect(r.gpu.step).not.toHaveBeenCalled()
    expect(r.gpu.uploadOrbits).not.toHaveBeenCalled()
  })

  it('uploads the answer, restarts on it and steps', async () => {
    const r = mount()
    r.frame(1000)
    const result = orbitResult()
    r.orbits.requests[0]!.resolve(result)
    await r.settle()
    expect(r.gpu.uploadOrbits).toHaveBeenCalledExactlyOnceWith(result.set)
    expect(r.lastSetup()).toMatchObject({
      size: SIZE,
      centerOffset: { x: 0, y: 0 },
      maxIterations: 1000,
      hasDc: true,
      useBla: true,
    })
    expect(r.gpu.step).toHaveBeenCalledExactlyOnceWith(16, context)
  })

  it('keeps its reference through a short pan, offset by the pan', async () => {
    const r = mount()
    await r.adopt()
    r.move(panView(SCENE.view, 100, 0, 600))
    r.frame(1100)
    expect(r.orbits.client.request).toHaveBeenCalledOnce()
    // Content dragged 100 px right puts the centre 100 px left of it.
    const { centerOffset } = r.lastSetup()
    expect(centerOffset.x).toBeCloseTo(-100, 2)
    expect(centerOffset.y).toBeCloseTo(0, 2)
    expect(r.lastSetup().useBla).toBe(true)
  })

  it('asks for a new reference ten octaves in, and iterates the old one meanwhile', async () => {
    const r = mount()
    await r.adopt()
    const deeper = { ...SCENE.view, zoomLog2: 30 }
    r.move(deeper)
    r.frame(1100)
    expect(r.orbits.client.request).toHaveBeenCalledTimes(2)
    expect(r.orbits.client.request).toHaveBeenLastCalledWith(
      referenceSpecFor(targetOf({ ...SCENE, view: deeper })),
    )
    expect(r.lastSetup()).toMatchObject({
      centerOffset: { x: 0, y: 0 },
      useBla: true,
    })
    // The step from before the zoom finishes; the next one is the new view's.
    r.steps[0]!.resolve({ active: 1000, gpuMs: 1 })
    await r.settle()
    expect(r.budgets()).toEqual([16, 16])
    r.frame(1200)
    expect(r.statuses.at(-1)).toMatchObject({ orbitPending: true })
  })

  it('cancels the reference it asked for once the view is back inside the old one', async () => {
    const r = mount()
    await r.adopt()
    r.move({ ...SCENE.view, zoomLog2: 30 })
    r.frame(1100)
    expect(r.orbits.client.request).toHaveBeenCalledTimes(2)

    r.move(SCENE.view)
    r.frame(1200)
    expect(r.orbits.client.cancel).toHaveBeenCalledOnce()
    // An answer that comes anyway is not adopted.
    r.orbits.requests[1]!.resolve(orbitResult())
    await r.settle()
    expect(r.gpu.uploadOrbits).toHaveBeenCalledOnce()

    // A restart with nothing on its way has nothing to cancel.
    r.move(panView(SCENE.view, 10, 0, 600))
    r.frame(1300)
    expect(r.orbits.client.cancel).toHaveBeenCalledOnce()
    expect(r.orbits.client.request).toHaveBeenCalledTimes(2)
  })

  it('keeps a Julia reference, and its BLA table, through a zoom out', async () => {
    const julia: ExplorerScene = {
      ...SCENE,
      kind: 'julia',
      view: { centerRe: '0.1', centerIm: '0.2', zoomLog2: 20 },
    }
    const r = mount(julia)
    await r.adopt()
    r.move({ ...julia.view, zoomLog2: 17 })
    r.frame(1100)
    expect(r.orbits.client.request).toHaveBeenCalledOnce()
    expect(r.lastSetup()).toMatchObject({ hasDc: false, useBla: true })
  })

  it('stops iterating after a pan too far for its reference to stand in', async () => {
    const r = mount()
    await r.adopt()
    const far = panView(SCENE.view, 3000, 0, 600)
    r.move(far)
    r.frame(1100)
    expect(r.orbits.client.request).toHaveBeenLastCalledWith(
      referenceSpecFor(targetOf({ ...SCENE, view: far })),
    )
    expect(r.lastSetup().centerOffset).toEqual({ x: 0, y: 0 })
    // The old view's step finishes; the backdrop is recoloured, not stepped.
    r.steps[0]!.resolve({ active: 1000, gpuMs: 1 })
    await vi.advanceTimersByTimeAsync(100)
    expect(r.gpu.step).toHaveBeenCalledOnce()
    expect(r.gpu.recolour).toHaveBeenLastCalledWith(context, false)
    r.orbits.requests[1]!.resolve(orbitResult())
    await r.settle()
    expect(r.gpu.step).toHaveBeenCalledTimes(2)
  })

  it('ignores an orbit that arrives after a newer one was asked for', async () => {
    const r = mount()
    r.frame(1000)
    r.move({ ...SCENE.view, zoomLog2: 30 })
    r.frame(1100)
    expect(r.orbits.client.request).toHaveBeenCalledTimes(2)
    r.orbits.requests[0]!.resolve(orbitResult())
    await r.settle()
    expect(r.gpu.uploadOrbits).not.toHaveBeenCalled()
    expect(r.gpu.step).not.toHaveBeenCalled()
    const newer = orbitResult()
    r.orbits.requests[1]!.resolve(newer)
    await r.settle()
    expect(r.gpu.uploadOrbits).toHaveBeenCalledExactlyOnceWith(newer.set)
    expect(r.gpu.step).toHaveBeenCalledOnce()
  })

  it('reports a failed orbit, and asks again once the view moves', async () => {
    const r = mount()
    r.frame(1000)
    r.orbits.requests[0]!.reject(new Error('the worker failed'))
    await r.settle()
    r.frame(1200)
    expect(r.statuses.at(-1)).toMatchObject({
      error: 'the worker failed',
      orbitPending: false,
    })
    r.move(panView(SCENE.view, 10, 0, 600))
    r.frame(1300)
    expect(r.orbits.client.request).toHaveBeenCalledTimes(2)
  })

  it('stops stepping, says why, and does not ask again when the GPU refuses the orbits', async () => {
    const r = mount()
    const refusal = deferred<string | undefined>()
    r.gpu.uploadOrbits.mockReturnValueOnce(refusal.promise)
    await r.adopt()
    expect(r.gpu.step).toHaveBeenCalledOnce()
    refusal.resolve('out of memory')
    await r.settle()
    r.steps[0]!.resolve({ active: 1000, gpuMs: 1 })
    await vi.advanceTimersByTimeAsync(100)
    expect(r.gpu.step).toHaveBeenCalledOnce()
    r.frame(1200)
    expect(r.statuses.at(-1)).toMatchObject({
      error: 'the GPU refused the orbits: out of memory',
      progress: 0,
    })
    // A pan the refused reference would serve does not ask for it again.
    r.move(panView(SCENE.view, 10, 0, 600))
    r.frame(1300)
    await r.settle()
    expect(r.orbits.client.request).toHaveBeenCalledOnce()
    expect(r.gpu.step).toHaveBeenCalledOnce()
  })
})

describe('ExplorerRenderer steps', () => {
  it('doubles the budget after a fast step, and drops it to 16 when a step is lost', async () => {
    const r = mount()
    await r.adopt()
    r.steps[0]!.resolve({ active: 1000, gpuMs: 1 })
    await r.settle()
    expect(r.budgets()).toEqual([16, 32])
    // The second step never completes.
    await vi.advanceTimersByTimeAsync(1999)
    expect(r.budgets()).toEqual([16, 32])
    await vi.advanceTimersByTimeAsync(1)
    // The next step is chained on a zero-delay timer, which fake timers put
    // a millisecond later when it is set from inside another timer.
    await vi.advanceTimersToNextTimerAsync()
    expect(r.budgets()).toEqual([16, 32, 16])
  })

  it('stops stepping and says why when the device rejects a step', async () => {
    const r = mount()
    await r.adopt()
    r.steps[0]!.reject(new Error('validation: binding too large'))
    await vi.advanceTimersByTimeAsync(100)
    expect(r.gpu.step).toHaveBeenCalledOnce()
    r.frame(1200)
    expect(r.statuses.at(-1)).toMatchObject({
      error: 'validation: binding too large',
      progress: 0,
    })
  })
})
