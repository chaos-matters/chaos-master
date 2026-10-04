/**
 * GPU resources and command encoding for the explorer.
 *
 * Owns the per-pixel state buffer, the reference orbits and their BLA
 * tables (`explorerOrbitBuffers.ts`), and the display buffers
 * (`explorerDisplays.ts`). On a view change
 * the display that was on screen becomes the *backdrop*: pixels that have
 * not finished yet show it, reprojected into the new view, so a zoom or pan
 * answers on the very next frame while the real iteration catches up (the
 * XaoS idea, done per pixel).
 *
 * Once a picture is finished it can be refined: `resample` iterates the
 * same view again at a sub-pixel offset without showing it, and
 * `accumulate` adds that sample into a linear-light sum, so filaments thinner
 * than a pixel settle into their average instead of speckling.
 *
 * Nothing here decides *when* to restart or how many steps to take; that is
 * `ExplorerRenderer`. This module only encodes what it is told.
 */
import { arrayOf, atomic, u32, vec2f, vec2u, vec4f } from 'typegpu/data'
import { colourEntry, presentFragment, presentVertex, } from './explorerColourShaders'
import { createDisplays, readBack } from './explorerDisplays'
import { bindingEntries, createOrbitBuffers, deviceErrors, fittedCapacity, } from './explorerOrbitBuffers'
import { colourLayout, ColourUniforms, FLAG_DERIVATIVE, FLAG_HAS_DC, FLAG_USE_BLA, initEntry, iterateEntry, iterateLayout, IterateUniforms, Pixel, presentLayout, Shade, WORKGROUP, } from './explorerShaders'
import type { TgpuBindGroup, TgpuRoot } from 'typegpu'
import type { BackdropMapping, ColourSetup, GridSize, IterationSetup, StepResult, } from './explorerTypes'
import type { GpuOrbitSet } from './orbitProtocol'

const { ceil, max } = Math

export const PALETTE_SIZE = 256
const PIXEL_BYTES = 32

export type ExplorerGpu = ReturnType<typeof createExplorerGpu>

export function createExplorerGpu(root: TgpuRoot, format: GPUTextureFormat) {
  const { device } = root
  const { performance } = globalThis

  const iterateUniforms = root.createBuffer(IterateUniforms).$usage('uniform')
  const colourUniforms = root.createBuffer(ColourUniforms).$usage('uniform')
  const presentSize = root.createBuffer(vec2u).$usage('uniform')
  const palette = root
    .createBuffer(arrayOf(vec2f, PALETTE_SIZE))
    .$usage('storage')
  const counters = root.createBuffer(arrayOf(atomic(u32), 4)).$usage('storage')
  const countersGpu = root.unwrap(counters)
  const staging = device.createBuffer({
    label: 'explorerCounterReadback',
    size: 16,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  let stagingBusy = false
  // Bound as the backdrop before there is one: a buffer may not be both the
  // readonly and the writable binding of one dispatch.
  const noBackdrop = root.createBuffer(arrayOf(u32, 1)).$usage('storage')

  const orbitBuffers = createOrbitBuffers(root)

  let size: GridSize = { width: 0, height: 0 }
  let pixelCapacity = 0
  let pixels = root.createBuffer(arrayOf(Pixel, 1)).$usage('storage')
  let base = root.createBuffer(arrayOf(Shade, 1)).$usage('storage')
  let accum = root.createBuffer(arrayOf(vec2u, 1)).$usage('storage')
  const displays = createDisplays(root)

  const initPipeline = root.createComputePipeline({ compute: initEntry })
  const iteratePipeline = root.createComputePipeline({ compute: iterateEntry })
  const colourPipeline = root.createComputePipeline({ compute: colourEntry })
  const presentPipeline = root.createRenderPipeline({
    vertex: presentVertex,
    fragment: presentFragment,
    targets: { format },
  })

  let iterateGroup: TgpuBindGroup | undefined
  let colourGroup: TgpuBindGroup | undefined
  let presentGroup: TgpuBindGroup | undefined

  let colour: ColourSetup = {
    period: 64,
    phase: 0,
    relief: 0.5,
    interior: [0.02, 0.02, 0.03],
    background: [0.06, 0.06, 0.08],
  }
  let mapping: BackdropMapping | undefined
  let paletteMean: [number, number] = [0, 0]
  let baseOffset = { x: 0, y: 0 }
  let sample = 0
  let fromBase = false

  function rebuildIterateGroup() {
    iterateGroup = root.createBindGroup(iterateLayout, {
      uniforms: iterateUniforms,
      ...orbitBuffers.bindings(),
      pixels,
      counters,
    })
  }

  function rebuildDisplayGroups() {
    const display = displays.display()
    if (!display) return
    colourGroup = root.createBindGroup(colourLayout, {
      uniforms: colourUniforms,
      pixels,
      palette,
      backdrop: displays.backdrop()?.buffer ?? noBackdrop,
      base,
      accum,
      display: display.buffer,
    })
    presentGroup = root.createBindGroup(presentLayout, {
      size: presentSize,
      display: display.buffer,
    })
  }

  /** The largest pixel grid the state buffers can hold on this device. */
  function maxPixels(): number {
    return bindingEntries(device.limits, PIXEL_BYTES)
  }

  /**
   * Fit the state buffers to a grid. The shaders index them by the grid's
   * width, so they may be larger: they are kept while the grid fits, which
   * spares a window being resized a reallocation of every buffer per frame.
   */
  function resize(grid: GridSize) {
    if (grid.width === size.width && grid.height === size.height) return
    size = grid
    const needed = max(1, grid.width * grid.height)
    const count = fittedCapacity(needed, pixelCapacity, maxPixels())
    if (count === pixelCapacity) return
    pixelCapacity = count
    pixels.destroy()
    pixels = root.createBuffer(arrayOf(Pixel, count)).$usage('storage')
    base.destroy()
    base = root.createBuffer(arrayOf(Shade, count)).$usage('storage')
    accum.destroy()
    accum = root.createBuffer(arrayOf(vec2u, count)).$usage('storage')
    rebuildIterateGroup()
  }

  /**
   * Upload a worker's orbits. Resolves to the device's complaint, if it had
   * one; the renderer then drops that reference.
   */
  function uploadOrbits(set: GpuOrbitSet): Promise<string | undefined> {
    return orbitBuffers.upload(set, rebuildIterateGroup)
  }

  function writeColourUniforms() {
    const backdrop = displays.backdrop()
    const current = displays.display()?.size ?? size
    const back = backdrop?.size ?? current
    colourUniforms.write({
      size: vec2u(current.width, current.height),
      backdropSize: vec2u(back.width, back.height),
      backdropOffset: vec2f(mapping?.offset.x ?? 0, mapping?.offset.y ?? 0),
      backdropScale: mapping?.scale ?? 1,
      backdropValid: mapping && backdrop ? 1 : 0,
      period: max(1, Math.round(colour.period)),
      phase: colour.phase,
      relief: colour.relief,
      paletteSize: PALETTE_SIZE,
      paletteMean: vec2f(paletteMean[0], paletteMean[1]),
      sample,
      fromBase: fromBase ? 1 : 0,
      interior: vec4f(...colour.interior, 1),
      background: vec4f(...colour.background, 1),
    })
  }

  /**
   * Start a new picture. The display on screen becomes the backdrop, seen
   * through `backdropMapping` until each pixel finishes. A display that was
   * never drawn (two restarts with no frame between) is not promoted: the
   * backdrop stays, and so must the caller's idea of what it shows
   * (`displayDrawn`).
   */
  function restart(
    setup: IterationSetup,
    backdropMapping: BackdropMapping | undefined,
  ) {
    resize(setup.size)
    displays.begin(size)
    mapping = backdropMapping
    baseOffset = setup.centerOffset
    sample = 0
    fromBase = false
    iterateUniforms.write({
      size: vec2u(size.width, size.height),
      centerOffset: vec2f(setup.centerOffset.x, setup.centerOffset.y),
      spacingMant: setup.spacing.mantissa,
      spacingExp: setup.spacing.exponent,
      maxIterations: setup.maxIterations,
      stepBudget: 0,
      flags:
        (setup.hasDc ? FLAG_HAS_DC : 0) |
        (setup.useBla ? FLAG_USE_BLA : 0) |
        FLAG_DERIVATIVE,
      ...orbitBuffers.info(),
    })
    presentSize.write(vec2u(size.width, size.height))
    writeColourUniforms()
    rebuildIterateGroup()
    rebuildDisplayGroups()
    initialise('explorerRestart')
  }

  function initialise(label: string) {
    const encoder = device.createCommandEncoder({ label })
    const pass = encoder.beginComputePass()
    initPipeline
      .with(pass)
      .with(iterateGroup!)
      .dispatchWorkgroups(...groups())
    pass.end()
    device.queue.submit([encoder.finish()])
  }

  /**
   * Start supersample `index` (1 or more) of the finished picture: every
   * pixel again, `jitter` pixels off its centre. Nothing is shown until
   * `accumulate`; the display keeps the picture so far.
   */
  function resample(index: number, jitter: { x: number; y: number }) {
    if (!iterateGroup) return
    sample = index
    iterateUniforms.patch({
      centerOffset: vec2f(baseOffset.x + jitter.x, baseOffset.y + jitter.y),
    })
    initialise('explorerResample')
  }

  /** Add the finished supersample into the average and present it. */
  function accumulate(context: GPUCanvasContext) {
    if (!colourGroup) return
    fromBase = false
    writeColourUniforms()
    const encoder = device.createCommandEncoder({ label: 'explorerAccumulate' })
    encodeColourAndPresent(encoder, context)
    device.queue.submit([encoder.finish()])
  }

  function groups(): [number, number, number] {
    return [ceil(size.width / WORKGROUP), ceil(size.height / WORKGROUP), 1]
  }

  function encodeColourAndPresent(
    encoder: GPUCommandEncoder,
    context: GPUCanvasContext,
  ) {
    const compute = encoder.beginComputePass()
    colourPipeline
      .with(compute)
      .with(colourGroup!)
      .dispatchWorkgroups(...groups())
    compute.end()
    displays.markDrawn()
    encodePresent(encoder, context)
  }

  function encodePresent(
    encoder: GPUCommandEncoder,
    context: GPUCanvasContext,
  ) {
    const render = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context
            .getCurrentTexture()
            .createView({ label: 'explorerPresent' }),
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    })
    presentPipeline.with(render).with(presentGroup!).draw(3)
    render.end()
  }

  /**
   * Advance every pixel by up to `budget` steps, then colour and present,
   * unless `context` is left out (a supersample, shown only once complete).
   */
  async function step(
    budget: number,
    context?: GPUCanvasContext,
  ): Promise<StepResult> {
    if (!colourGroup || !iterateGroup || !orbitBuffers.loaded()) {
      return { active: undefined, gpuMs: 0 }
    }
    iterateUniforms.patch({ stepBudget: budget })
    const group = iterateGroup
    const readBack = !stagingBusy
    let t0 = 0
    const errors = deviceErrors(device, () => {
      const encoder = device.createCommandEncoder({ label: 'explorerStep' })
      encoder.clearBuffer(countersGpu)
      const pass = encoder.beginComputePass()
      iteratePipeline
        .with(pass)
        .with(group)
        .dispatchWorkgroups(...groups())
      pass.end()
      if (readBack) encoder.copyBufferToBuffer(countersGpu, 0, staging, 0, 16)
      if (context) {
        fromBase = false
        writeColourUniforms()
        encodeColourAndPresent(encoder, context)
      }
      t0 = performance.now()
      device.queue.submit([encoder.finish()])
    })
    let active: number | undefined
    if (readBack) {
      stagingBusy = true
      try {
        await staging.mapAsync(GPUMapMode.READ)
        active = new Uint32Array(staging.getMappedRange())[0]
        staging.unmap()
      } finally {
        stagingBusy = false
      }
    } else {
      await device.queue.onSubmittedWorkDone()
    }
    // Invalid work (a binding past a device limit) completes as a no-op
    // and the counter reads stale: never let that pass for progress.
    const failure = await errors
    if (failure !== undefined) throw new Error(failure)
    return { active, gpuMs: performance.now() - t0 }
  }

  /**
   * Colour and present without iterating, and start the average over.
   * `finished` colours from the centre sample kept in `base`, whatever the
   * pixel buffer holds now (a supersample, part done); otherwise from the
   * pixels of the main pass, finished or not.
   */
  function recolour(context: GPUCanvasContext, finished: boolean) {
    if (!colourGroup) return
    sample = 0
    fromBase = finished
    writeColourUniforms()
    const encoder = device.createCommandEncoder({ label: 'explorerRecolour' })
    encodeColourAndPresent(encoder, context)
    device.queue.submit([encoder.finish()])
  }

  /** Show the display again, unchanged: the canvas was cleared by a resize. */
  function present(context: GPUCanvasContext) {
    if (!presentGroup || !displays.drawn()) return
    const encoder = device.createCommandEncoder({ label: 'explorerPresent' })
    encodePresent(encoder, context)
    device.queue.submit([encoder.finish()])
  }

  function setColour(next: ColourSetup) {
    colour = next
  }

  /** `ab` holds PALETTE_SIZE interleaved OkLab (a, b) pairs. */
  function setPalette(ab: Float32Array<ArrayBuffer>) {
    device.queue.writeBuffer(root.unwrap(palette), 0, ab)
    let a = 0
    let b = 0
    for (let i = 0; i < ab.length; i += 2) {
      a += ab[i]!
      b += ab[i + 1]!
    }
    paletteMean = [(2 * a) / ab.length, (2 * b) / ab.length]
  }

  /** Raw pixel state, for the headed verification script. */
  function readPixels(): Promise<ArrayBuffer> {
    return readBack(
      device,
      root.unwrap(pixels),
      size.width * size.height * PIXEL_BYTES,
    )
  }

  function destroy() {
    const owned = [iterateUniforms, colourUniforms, presentSize, palette]
    for (const b of [...owned, counters, noBackdrop, pixels, base, accum])
      b.destroy()
    displays.destroy()
    orbitBuffers.destroy()
    staging.destroy()
  }

  return {
    maxPixels,
    maxOrbitEntries: orbitBuffers.maxOrbitEntries,
    uploadOrbits,
    restart,
    resample,
    accumulate,
    step,
    recolour,
    present,
    displayDrawn: displays.drawn,
    setColour,
    setPalette,
    readDisplay: displays.read,
    readPixels,
    destroy,
    hasOrbits: orbitBuffers.loaded,
  }
}
