/**
 * An open canvas shows a custom variation's edit. Editing one in place keeps
 * its type name, so nothing in the flame changes, yet the renderer must
 * rebuild its IFS pipeline with the new code: once per edit, with no
 * structural edit, and not when the saved library loads before it renders.
 * An export keeps the code it started with until it ends, and a saved
 * library with a broken entry does not stop the next edit from showing.
 *
 * Flam3 is the real one, on a stand-in GPU root that records the compute
 * function of each IFS pipeline it compiles. Its render loops and its filter
 * and grading passes are stubbed: only the IFS pipeline carries variation
 * code, and building it is what a rebuild is.
 */
import { cleanup, render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { tgpu } from 'typegpu'
import { vec4f } from 'typegpu/data'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Camera3DContextProvider } from '@/lib/Camera3DContext'
import { CameraContextProvider } from '@/lib/CameraContext'
import { CanvasContextProvider } from '@/lib/CanvasContext'
import { RootContextProvider } from '@/lib/RootContext'
import { legacyRandomOutputSlot } from '@/shaders/random'
import { recordEntries } from '@/utils/record'
import { examples } from './examples'
import { Flam3 } from './Flam3'
import { createIFSPipeline } from './ifsPipeline'
import { createIFSPipeline3D } from './ifsPipeline3D'
import { setExportQuality } from './renderStats'
import { generateVariationId } from './transformFunction'
import { clearAllCustomVariations, createCustomVariation, deleteCustomVariation, loadCustomVariations, restoreCustomVariation, updateCustomVariation, } from './variations/custom'
import type { Accessor, ComponentProps } from 'solid-js'
import type * as ColorGrading from './colorGrading'
import type * as IfsPipeline from './ifsPipeline'
import type * as IfsPipeline3D from './ifsPipeline3D'
import type * as RenderDrivers from './renderDrivers'
import type { FlameDescriptor } from './schema/flameSchema'

vi.mock('./ifsPipeline', async (importOriginal) => {
  const original = await importOriginal<typeof IfsPipeline>()
  return { ...original, createIFSPipeline: vi.fn(original.createIFSPipeline) }
})
vi.mock('./ifsPipeline3D', async (importOriginal) => {
  const original = await importOriginal<typeof IfsPipeline3D>()
  return {
    ...original,
    createIFSPipeline3D: vi.fn(original.createIFSPipeline3D),
  }
})
vi.mock('./renderDrivers', async (importOriginal) => ({
  ...(await importOriginal<typeof RenderDrivers>()),
  createInteractiveRenderDriver: () => ({ redraw: () => {} }),
  createExportRenderDriver: () => ({
    wake: () => {},
    getExportIterationCount: () => 1,
  }),
}))
vi.mock('./colorGrading', async (importOriginal) => ({
  ...(await importOriginal<typeof ColorGrading>()),
  createColorGradingPipeline: () => inert(),
}))
vi.mock('./densityEstimationPipeline', () => ({
  createDensityEstimationPipeline: () => inert(),
}))
vi.mock('./adaptiveBlurPipeline', () => ({
  createAdaptiveBlurPipeline: () => inert(),
}))

/** An object whose every method does nothing. */
function inert(): never {
  return new Proxy({}, { get: () => () => undefined }) as never
}

type FakeBuffer = {
  $usage: () => FakeBuffer
  write: () => void
  destroy: () => void
  buffer: object
}

/** A GPU root that records the compute function of each pipeline it compiles. */
function recordingRoot() {
  const compiled: unknown[] = []
  const buffer: FakeBuffer = {
    $usage: () => buffer,
    write: () => {},
    destroy: () => {},
    buffer: {},
  }
  const createComputePipeline = ({ compute }: { compute: unknown }) => {
    compiled.push(compute)
    const pipeline = {
      $name: () => pipeline,
      with: () => pipeline,
      dispatchWorkgroups: () => {},
    }
    return pipeline
  }
  const root = {
    createBuffer: () => buffer,
    createBindGroup: () => ({}),
    createComputePipeline,
    with: () => ({ createComputePipeline }),
  }
  return { root, compiled }
}

const device = {
  queue: {
    onSubmittedWorkDone: () => Promise.resolve(),
    submit: () => {},
    writeBuffer: () => {},
  },
  createCommandEncoder: () => inert(),
}

const camera = {
  update: () => {},
  bindGroup: {},
  zoom: () => 1,
  position: () => [0, 0, -3],
  target: () => [0, 0, 0],
  fov: () => 50,
}

function wgslOf(compute: unknown): string {
  return tgpu.resolve([compute] as never, {
    names: 'strict',
    config: (config) => config.with(legacyRandomOutputSlot, false),
  })
}

/** `base` with its first transform running only `type`. */
function flameUsing(type: string, base: FlameDescriptor): FlameDescriptor {
  const [tid, transform] = recordEntries(base.transforms)[0]!
  return {
    ...base,
    transforms: {
      [tid]: {
        ...transform,
        variations: {
          [generateVariationId()]: { type, weight: 1, visible: true },
        },
      },
    },
  }
}

type ExportProps = Pick<
  ComponentProps<typeof Flam3>,
  'exportDriver' | 'isExportRenderer'
>

/**
 * Mounts a Flam3 drawing `flame` on a recording root, as an open canvas, or
 * as an export's canvas with `exportProps`. An accessor plays frames.
 */
function renderFlame(
  flame: FlameDescriptor | Accessor<FlameDescriptor>,
  exportProps: ExportProps = {},
) {
  const { root, compiled } = recordingRoot()
  const current = typeof flame === 'function' ? flame : () => flame
  render(() => (
    <RootContextProvider
      value={{
        adapter: {} as never,
        device: device as never,
        root: root as never,
        gpuReady: () => false,
      }}
    >
      <CanvasContextProvider
        value={{
          canvas: document.createElement('canvas'),
          pixelRatio: () => 1,
          canvasSize: () => ({ width: 8, height: 8 }),
          context: inert(),
          canvasFormat: 'bgra8unorm',
        }}
      >
        <CameraContextProvider value={camera as never}>
          <Camera3DContextProvider value={camera as never}>
            <Flam3
              quality={1}
              pointCountPerBatch={64}
              renderInterval={1}
              adaptiveFilterEnabled={true}
              animationEnabled={false}
              flameDescriptor={current()}
              edgeFadeColor={vec4f(0)}
              {...exportProps}
            />
          </Camera3DContextProvider>
        </CameraContextProvider>
      </CanvasContextProvider>
    </RootContextProvider>
  ))
  return compiled
}

const BEFORE = 'return vec2f(pos.x * 1.375, pos.y);'
const AFTER = 'return vec2f(pos.x * 2.625, pos.y);'

/** Writes a saved library, as a previous session left it, without loading it. */
function saveLibrary(count: number): string[] {
  const ids = Array.from({ length: count }, (_, i) => `custom_saved_${i}`)
  const variations = Object.fromEntries(
    ids.map((id, i) => [
      id,
      { id, name: `Saved ${i}`, wgsl: BEFORE, createdAt: 0, updatedAt: 0 },
    ]),
  )
  localStorage.setItem(
    'chaos-master-custom-variations',
    JSON.stringify({ version: 1, variations }),
  )
  return ids
}

// The test runner's own localStorage is not a working Storage.
const stored = new Map<string, string>()
const memoryStorage: Storage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => {
    stored.set(key, value)
  },
  removeItem: (key) => {
    stored.delete(key)
  },
  clear: () => {
    stored.clear()
  },
  key: (index) => [...stored.keys()][index] ?? null,
  get length() {
    return stored.size
  },
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage)
  clearAllCustomVariations()
  stored.clear()
  vi.mocked(createIFSPipeline).mockClear()
  vi.mocked(createIFSPipeline3D).mockClear()
})

afterEach(() => {
  cleanup()
  setExportQuality(undefined)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe.each([
  [2, examples.example2, createIFSPipeline],
  [3, examples.example40, createIFSPipeline3D],
] as const)('an open %dD canvas', (_dimensions, base, build) => {
  it('rebuilds once, with the new code, when a custom variation it draws is edited', () => {
    const made = createCustomVariation('Stretch', BEFORE)
    if (!made.success) throw new Error(JSON.stringify(made.errors))
    const compiled = renderFlame(flameUsing(made.def.id, base))
    expect(vi.mocked(build)).toHaveBeenCalledTimes(1)
    expect(wgslOf(compiled.at(-1))).toContain('1.375')

    const edited = updateCustomVariation(made.def.id, AFTER)
    if (!edited.success) throw new Error(JSON.stringify(edited.errors))

    expect(vi.mocked(build)).toHaveBeenCalledTimes(2)
    const after = wgslOf(compiled.at(-1))
    expect(after).toContain('2.625')
    expect(after).not.toContain('1.375')
  })

  it('drops a custom variation it draws when it is deleted, and draws it again on undo', () => {
    const made = createCustomVariation('Stretch', BEFORE)
    if (!made.success) throw new Error(JSON.stringify(made.errors))
    const compiled = renderFlame(flameUsing(made.def.id, base))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    deleteCustomVariation(made.def.id)
    expect(vi.mocked(build)).toHaveBeenCalledTimes(2)
    expect(wgslOf(compiled.at(-1))).not.toContain('1.375')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(made.def.id))

    expect(restoreCustomVariation(made.def)).toBe(true)
    expect(vi.mocked(build)).toHaveBeenCalledTimes(3)
    expect(wgslOf(compiled.at(-1))).toContain('1.375')
  })

  it('builds once when the saved library loads before it renders', () => {
    const [id] = saveLibrary(3)
    loadCustomVariations()
    renderFlame(flameUsing(id!, base))
    expect(vi.mocked(build)).toHaveBeenCalledTimes(1)
  })

  it('rebuilds once, not once per variation, when the library loads while it renders', () => {
    saveLibrary(3)
    renderFlame(base)
    loadCustomVariations()
    expect(vi.mocked(build)).toHaveBeenCalledTimes(2)
  })

  it('still shows the next edit after a saved library with a broken entry loads', () => {
    const made = createCustomVariation('Stretch', BEFORE)
    if (!made.success) throw new Error(JSON.stringify(made.errors))
    localStorage.setItem(
      'chaos-master-custom-variations',
      JSON.stringify({
        version: 1,
        variations: { [made.def.id]: made.def, custom_broken: null },
      }),
    )
    const compiled = renderFlame(flameUsing(made.def.id, base))
    loadCustomVariations()
    const builds = vi.mocked(build).mock.calls.length

    updateCustomVariation(made.def.id, AFTER)

    expect(vi.mocked(build)).toHaveBeenCalledTimes(builds + 1)
    expect(wgslOf(compiled.at(-1))).toContain('2.625')
  })

  it('keeps an export job on its code through an unrelated create and a rename', () => {
    const made = createCustomVariation('Stretch', BEFORE)
    if (!made.success) throw new Error(JSON.stringify(made.errors))
    const compiled = renderFlame(flameUsing(made.def.id, base), {
      exportDriver: true,
    })
    expect(vi.mocked(build)).toHaveBeenCalledTimes(1)

    createCustomVariation('Unrelated', AFTER)
    updateCustomVariation(made.def.id, BEFORE, 'Stretch, renamed')

    expect(vi.mocked(build)).toHaveBeenCalledTimes(1)
    expect(wgslOf(compiled.at(-1))).toContain('1.375')
  })

  it('keeps an animation export on the code it started with through its later frames', () => {
    const made = createCustomVariation('Stretch', BEFORE)
    if (!made.success) throw new Error(JSON.stringify(made.errors))
    const first = flameUsing(made.def.id, base)
    const [frame, setFrame] = createSignal(first)
    const compiled = renderFlame(frame, { exportDriver: true })

    updateCustomVariation(made.def.id, AFTER)
    // The next frame: the same flame, brighter.
    setFrame({
      ...first,
      renderSettings: {
        ...first.renderSettings,
        exposure: first.renderSettings.exposure + 0.5,
      },
    })

    expect(vi.mocked(build)).toHaveBeenCalledTimes(1)
    expect(wgslOf(compiled.at(-1))).toContain('1.375')
  })

  it('takes the edit on the workspace canvas when its export ends', () => {
    const made = createCustomVariation('Stretch', BEFORE)
    if (!made.success) throw new Error(JSON.stringify(made.errors))
    const compiled = renderFlame(flameUsing(made.def.id, base), {
      isExportRenderer: true,
    })
    setExportQuality(1)

    updateCustomVariation(made.def.id, AFTER)
    expect(vi.mocked(build)).toHaveBeenCalledTimes(1)

    setExportQuality(undefined)
    expect(vi.mocked(build)).toHaveBeenCalledTimes(2)
    expect(wgslOf(compiled.at(-1))).toContain('2.625')
  })
})
