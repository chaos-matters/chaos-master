/**
 * The explorer's frame loop: decides when to restart the picture, when a new
 * reference orbit is needed, and how many steps each frame may take.
 *
 * Mounted inside `<AutoCanvas>`, so a live device is guaranteed. Each step
 * is one bounded unit of GPU work (adapted towards `TARGET_FRAME_MS`), and
 * the next is only submitted once it has finished, so the page stays
 * responsive and no dispatch can run long enough to reset the GPU, whatever
 * the depth or iteration limit.
 *
 * A finished picture is then refined: up to `samples` jittered passes of
 * the same view, averaged, so detail finer than a pixel reads as texture
 * rather than noise. What happens next is decided by `nextAction`
 * (`explorerSchedule.ts`); this file only carries it out.
 */
import { backdropMapping, pixelSpacing, referenceOffset, referenceServes, referenceSpecFor, standIn, } from '@chaos-master/core'
import { createEffect, onCleanup } from 'solid-js'
import { useCanvas } from '@/lib/CanvasContext'
import { useLiveRootContext } from '@/lib/RootContext'
import { createExplorerGpu, PALETTE_SIZE } from './explorerGpu'
import { attachExplorerInput } from './explorerInput'
import { paletteLut } from './explorerPalette'
import { jitterFor, nextAction, withTimeout } from './explorerSchedule'
import { createOrbitClient } from './orbitClient'
import type { ComplexString, DeepZoomView, ExplorerTarget, FractalKind, ReferenceSpec, ReferenceState, } from '@chaos-master/core'
import type { ColourSetup, GridSize } from './explorerTypes'
import type { Palette } from '@/flame/colorMap'

const { floor, max, min, round, sqrt } = Math

const TARGET_FRAME_MS = 10
const INITIAL_BUDGET = 16
const MAX_BUDGET = 1 << 16
/** A GPU completion that has not arrived by now is treated as lost. */
const STEP_TIMEOUT_MS = 2000
const STATUS_INTERVAL_MS = 100
/** Quiet time after a colour change before supersampling resumes. */
const REFINE_DELAY_MS = 300

export interface ExplorerScene {
  readonly kind: FractalKind
  readonly view: DeepZoomView
  readonly juliaC: ComplexString
  readonly maxIterations: number
}

export interface ExplorerStatus {
  /** Fraction of pixels finished, 0..1. */
  readonly progress: number
  readonly orbitPending: boolean
  readonly orbitProgress: number
  readonly orbitMs: number | undefined
  readonly grid: GridSize
  readonly stepBudget: number
  /** Supersamples averaged into the picture so far, and the target. */
  readonly samples: number
  readonly sampleTarget: number
  /** Set when this device cannot hold the orbits the chosen limit needs. */
  readonly iterationCap: number | undefined
  readonly error: string | undefined
}

export interface ExplorerRendererProps {
  scene: () => ExplorerScene
  setView: (view: DeepZoomView) => void
  colour: () => ColourSetup
  palette: () => Palette
  /** Most render pixels to use; the canvas is upscaled past this. */
  pixelCap: () => number
  /** Supersamples per pixel once a picture is finished; 1 turns it off. */
  samples: () => number
  onStatus: (status: ExplorerStatus) => void
  /** Registers the save action once the renderer is up. */
  onReady?: (api: {
    readDisplay: ReturnType<typeof createExplorerGpu>['readDisplay']
  }) => void
  /** DEV builds: the global the debug handle is published under. */
  debugName?: string
}

function targetKey(t: ExplorerTarget): string {
  // The Mandelbrot set does not depend on c, so moving the split view's
  // point must not restart its picture.
  const c = t.kind === 'julia' ? t.juliaC : { re: '', im: '' }
  return [
    t.kind,
    t.view.centerRe,
    t.view.centerIm,
    t.view.zoomLog2,
    c.re,
    c.im,
    t.maxIterations,
    t.width,
    t.height,
  ].join('|')
}

export function ExplorerRenderer(props: ExplorerRendererProps) {
  const { root } = useLiveRootContext()
  const { canvas, context, canvasFormat, canvasSize } = useCanvas()
  const { performance } = globalThis
  const gpu = createExplorerGpu(root, canvasFormat)
  onCleanup(() => {
    gpu.destroy()
  })

  let orbitProgress = 0
  const orbits = createOrbitClient((fraction) => {
    orbitProgress = fraction
  })
  onCleanup(() => {
    orbits.dispose()
  })

  let grid: GridSize = { width: 1, height: 1 }
  let reference: ReferenceState | undefined
  let requested: ReferenceSpec | undefined
  /** A reference the GPU would not take, not asked for again. */
  let refused: ReferenceSpec | undefined
  let shown: ExplorerTarget | undefined
  /** The view the GPU's backdrop shows, which lags `shown` by a picture. */
  let backdropOf: ExplorerTarget | undefined
  let lastKey = ''
  let generation = 0
  let iterating = false
  let active = 0
  let budget = INITIAL_BUDGET
  /**
   * The budget measured while most pixels were still iterating. A pass
   * adapts upwards as pixels finish; a supersample, which restarts them all,
   * must start from this, not from where the last pass ended.
   */
  let loadedBudget = INITIAL_BUDGET
  let lastCanvas = { width: 0, height: 0 }
  let inFlight = false
  let needsPresent = true
  let orbitMs: number | undefined
  let error: string | undefined
  let lastStatus = 0
  /** When the current picture started iterating, and when it finished. */
  let startedAt = 0
  let finishedAt = 0
  let refinedAt = 0
  /** Samples averaged into the display; 0 until the main pass finishes. */
  let samples = 0
  /** A supersample is iterating; `refineDone` once it has finished. */
  let refining = false
  let refineDone = false
  let jitter = { x: 0, y: 0 }
  let colourChangedAt = -Infinity
  let refineTimer: ReturnType<typeof setTimeout> | undefined
  const stats = { frames: 0, steps: 0, timeouts: 0, lastMs: 0 }

  /** The render grid for the canvas, or undefined before it is measured. */
  function gridFor(): GridSize | undefined {
    const { width, height } = canvasSize()
    if (width < 2 || height < 2) return undefined
    const cap = min(props.pixelCap(), gpu.maxPixels())
    const scale = min(1, sqrt(cap / max(1, width * height)))
    return {
      width: max(1, floor(width * scale)),
      height: max(1, floor(height * scale)),
    }
  }

  /** The most iterations whose orbits fit one storage binding here. */
  function iterationCap(scene: ExplorerScene): number {
    const orbitsPerSet = scene.kind === 'julia' ? 2 : 1
    return floor(gpu.maxOrbitEntries() / orbitsPerSet) - 1
  }

  function currentTarget(): ExplorerTarget {
    const scene = props.scene()
    return {
      ...scene,
      maxIterations: min(scene.maxIterations, iterationCap(scene)),
      width: grid.width,
      height: grid.height,
    }
  }

  canvas.tabIndex = 0
  canvas.style.touchAction = 'none'
  onCleanup(
    attachExplorerInput(canvas, {
      view: () => props.scene().view,
      setView: (view) => {
        props.setView(view)
      },
      gridScale: () => grid.width / max(1, canvas.clientWidth),
      minDimension: () => max(1, min(grid.width, grid.height)),
    }),
  )

  let colourSet = false

  function colourChanged() {
    needsPresent = true
    // The first colouring is not a change anyone is still making.
    if (colourSet) colourChangedAt = performance.now()
  }
  createEffect(() => {
    gpu.setPalette(paletteLut(props.palette(), PALETTE_SIZE))
    colourChanged()
  })
  createEffect(() => {
    gpu.setColour(props.colour())
    colourChanged()
    colourSet = true
  })

  /** Ask for a reference that serves `t`, unless one does or is on its way. */
  function ensureReference(t: ExplorerTarget) {
    if (reference && referenceServes(reference, t)) {
      // Back inside the current reference: a pending one is no longer
      // wanted, and adopting it late would restart a finished picture.
      if (requested) orbits.cancel()
      requested = undefined
      return
    }
    for (const pending of [requested, refused]) {
      if (pending && referenceServes({ ...pending, complete: false }, t)) return
    }
    const spec = referenceSpecFor(t)
    if (!referenceServes({ ...spec, complete: false }, t)) {
      // A fresh reference that cannot serve its own view would be asked for
      // again every frame; say so instead.
      error = 'this view is outside what the explorer can render'
      return
    }
    requested = spec
    orbitProgress = 0
    orbits
      .request(spec)
      .then((result) => {
        if (!result || requested !== spec) return
        const { main, critical } = result.set
        const adopted = {
          ...spec,
          complete: main.escaped && (critical?.escaped ?? true),
        }
        const refuse = (cause: unknown) => {
          // A newer reference has replaced this one already.
          if (reference !== adopted) return
          // Nothing iterates against it, and the backdrop stays on screen.
          refused = spec
          reference = undefined
          iterating = false
          const message = cause instanceof Error ? cause.message : cause
          error = `the GPU refused the orbits: ${String(message)}`
        }
        gpu.uploadOrbits(result.set).then((message) => {
          if (message !== undefined) refuse(message)
        }, refuse)
        reference = adopted
        requested = undefined
        refused = undefined
        orbitMs = result.ms
        error = undefined
        lastKey = ''
        setTimeout(tick, 0)
      })
      .catch((cause: unknown) => {
        // A newer request supersedes this one's failure too.
        if (requested !== spec) return
        error = cause instanceof Error ? cause.message : String(cause)
        requested = undefined
      })
  }

  function restart(t: ExplorerTarget) {
    generation += 1
    // Only a display that was drawn becomes the backdrop (see `restart`).
    if (gpu.displayDrawn()) backdropOf = shown
    const mapping = backdropOf ? backdropMapping(backdropOf, t) : undefined
    ensureReference(t)
    // A reference on its way out keeps rendering until the next one is in.
    const use = reference ? standIn(reference, t) : undefined
    const md = max(1, min(t.width, t.height))
    gpu.restart(
      {
        size: grid,
        centerOffset: use ? referenceOffset(reference!, t) : { x: 0, y: 0 },
        spacing: pixelSpacing(t.view.zoomLog2, md),
        maxIterations: t.maxIterations,
        hasDc: t.kind === 'mandelbrot',
        useBla: use?.useBla ?? true,
      },
      mapping,
    )
    shown = t
    iterating = use !== undefined
    samples = 0
    refining = false
    refineDone = false
    jitter = { x: 0, y: 0 }
    startedAt = performance.now()
    finishedAt = 0
    refinedAt = 0
    active = t.width * t.height
    budget = INITIAL_BUDGET
    loadedBudget = INITIAL_BUDGET
    needsPresent = true
  }

  function step() {
    inFlight = true
    const gen = generation
    const t0 = performance.now()
    withTimeout(
      gpu.step(budget, refining ? undefined : context),
      STEP_TIMEOUT_MS,
    )
      .then((result) => {
        if (gen !== generation) return
        stats.steps += 1
        if (!result) {
          // Lost completion: back off hard rather than assume anything.
          stats.timeouts += 1
          budget = INITIAL_BUDGET
          return
        }
        if (result.active !== undefined) active = result.active
        if (active === 0 && refining) {
          refining = false
          refineDone = true
        } else if (active === 0 && samples === 0) {
          samples = 1
          finishedAt = performance.now()
        }
        const ms = max(result.gpuMs, performance.now() - t0, 0.25)
        stats.lastMs = ms
        const factor = min(2, max(0.5, TARGET_FRAME_MS / ms))
        budget = min(MAX_BUDGET, max(4, round(budget * factor)))
        if (active * 2 >= grid.width * grid.height) loadedBudget = budget
      })
      .catch((cause: unknown) => {
        error = cause instanceof Error ? cause.message : String(cause)
        iterating = false
      })
      .finally(() => {
        inFlight = false
        // Chain the next step on completion rather than on the next frame:
        // iteration runs at GPU speed while presenting still follows the
        // display. A hidden page stops here and resumes from `frame`.
        if (!disposed && document.visibilityState === 'visible')
          setTimeout(tick, 0)
      })
  }

  function reportStatus(now: number) {
    if (now - lastStatus < STATUS_INTERVAL_MS) return
    lastStatus = now
    const total = max(1, grid.width * grid.height)
    const cap = iterationCap(props.scene())
    props.onStatus({
      progress: !iterating ? 0 : samples > 0 ? 1 : 1 - active / total,
      orbitPending: requested !== undefined,
      orbitProgress,
      orbitMs,
      grid,
      stepBudget: budget,
      samples,
      sampleTarget: sampleTarget(),
      iterationCap: cap < props.scene().maxIterations ? cap : undefined,
      error,
    })
  }

  function sampleTarget(): number {
    return max(1, floor(props.samples()))
  }

  function tick() {
    if (disposed) return
    // Resizing a canvas clears it, and a grid capped by the pixel budget
    // often stays the same size, so nothing else would draw it again.
    const size = canvasSize()
    if (size.width !== lastCanvas.width || size.height !== lastCanvas.height) {
      lastCanvas = size
      gpu.present(context)
    }
    const measured = gridFor()
    if (!measured) return
    grid = measured
    const t = currentTarget()
    const key = targetKey(t)
    if (key !== lastKey) {
      lastKey = key
      restart(t)
    }
    for (;;) {
      const now = performance.now()
      const action = nextAction({
        inFlight,
        iterating,
        samples,
        sampleTarget: sampleTarget(),
        refining,
        refineDone,
        colourChanged: needsPresent,
        now,
        colourChangedAt,
        refineDelayMs: REFINE_DELAY_MS,
      })
      switch (action.kind) {
        case 'idle':
          return
        case 'later':
          refineTimer ??= setTimeout(() => {
            refineTimer = undefined
            tick()
          }, action.ms)
          return
        case 'step':
          needsPresent = false
          step()
          return
        case 'stepHidden':
          step()
          return
        case 'recolour':
          gpu.recolour(context, action.finished)
          needsPresent = false
          refining = false
          refineDone = false
          jitter = { x: 0, y: 0 }
          if (action.finished) samples = 1
          break
        case 'accumulate':
          gpu.accumulate(context)
          refineDone = false
          samples += 1
          if (samples >= sampleTarget()) refinedAt = now
          break
        case 'refine':
          jitter = jitterFor(samples)
          gpu.resample(samples, jitter)
          refining = true
          active = grid.width * grid.height
          budget = loadedBudget
          break
      }
    }
  }

  let frameId = 0
  let disposed = false

  function frame(now: number) {
    if (disposed) return
    stats.frames += 1
    tick()
    reportStatus(now)
    frameId = requestAnimationFrame(frame)
  }
  frameId = requestAnimationFrame(frame)
  onCleanup(() => {
    disposed = true
    cancelAnimationFrame(frameId)
    clearTimeout(refineTimer)
  })

  props.onReady?.({ readDisplay: gpu.readDisplay })

  if (import.meta.env.DEV) {
    const name = props.debugName ?? '__explorerDebug'
    const globals = globalThis as unknown as Record<string, unknown>
    const handle = {
      readPixels: () => gpu.readPixels(),
      readDisplay: () => gpu.readDisplay(),
      grid: () => grid,
      reference: () => reference,
      target: () => currentTarget(),
      done: () => iterating && !refining && samples >= sampleTarget(),
      stats: () => ({ ...stats, budget, active, inFlight }),
      renderMs: () => (finishedAt > 0 ? finishedAt - startedAt : undefined),
      refineMs: () => (refinedAt > 0 ? refinedAt - startedAt : undefined),
      samples: () => samples,
      // The pixel buffer holds the latest supersample, so include its jitter.
      offset: () => {
        if (!reference) return undefined
        const o = referenceOffset(reference, currentTarget())
        return { x: o.x + jitter.x, y: o.y + jitter.y }
      },
    }
    globals[name] = handle
    onCleanup(() => {
      // Another renderer may have published under the same name since.
      if (globals[name] === handle) delete globals[name]
    })
  }

  return null
}
