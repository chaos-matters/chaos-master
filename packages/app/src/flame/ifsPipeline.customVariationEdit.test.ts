/**
 * Editing a custom variation in place keeps its type name, so a shader cache
 * keyed on variation types alone would go on running the old code. Each IFS
 * pipeline, rebuilt after the edit on the same root, must run the new code.
 *
 * The root below records the compute function of every pipeline it dispatches,
 * and `tgpu.resolve` turns that function into WGSL with no GPU device (as in
 * ifsPipeline.resolve.test.ts).
 */
import { createRoot } from 'solid-js'
import { tgpu } from 'typegpu'
import { afterEach, describe, expect, it } from 'vitest'
import { legacyRandomOutputSlot } from '@/shaders/random'
import { recordEntries } from '@/utils/record'
import { examples } from './examples'
import { createIFSPipeline } from './ifsPipeline'
import { createIFSPipeline3D } from './ifsPipeline3D'
import { generateVariationId } from './transformFunction'
import { createCustomVariation, deleteCustomVariation, updateCustomVariation, } from './variations/custom'
import type { TransformRecord } from './schema/flameSchema'

type FakeBuffer = {
  $usage: () => FakeBuffer
  write: () => void
  destroy: () => void
  buffer: object
}
type FakePipeline = {
  $name: () => FakePipeline
  with: () => FakePipeline
  dispatchWorkgroups: () => void
}

/** One GPU root for a renderer's life, as Flam3 keeps it across rebuilds. */
function recordingRoot() {
  const dispatched: unknown[] = []
  const buffer: FakeBuffer = {
    $usage: () => buffer,
    write: () => {},
    destroy: () => {},
    buffer: {},
  }
  const createComputePipeline = ({ compute }: { compute: unknown }) => {
    const pipeline: FakePipeline = {
      $name: () => pipeline,
      with: () => pipeline,
      dispatchWorkgroups: () => {
        dispatched.push(compute)
      },
    }
    return pipeline
  }
  const root = {
    createBuffer: () => buffer,
    createBindGroup: () => ({}),
    createComputePipeline,
    with: () => ({ createComputePipeline }),
  }
  return { root, buffer, dispatched }
}

type RecordingRoot = ReturnType<typeof recordingRoot>

/** Builds the pipeline for `transforms`, runs it once, returns the WGSL it ran. */
function runPipeline(
  dimensions: 2 | 3,
  { root, buffer, dispatched }: RecordingRoot,
  transforms: TransformRecord,
): string {
  const gpuRoot = root as never
  const camera = { bindGroup: {} } as never
  const fake = buffer as never
  createRoot((dispose) => {
    const pipeline =
      dimensions === 3
        ? createIFSPipeline3D(
            gpuRoot,
            camera,
            20,
            fake,
            fake,
            fake,
            transforms,
            [64, 64],
            fake,
          )
        : createIFSPipeline(
            gpuRoot,
            camera,
            20,
            fake,
            fake,
            fake,
            transforms,
            [64, 64],
            fake,
          )
    pipeline.run({} as GPUComputePassEncoder, 1)
    dispose()
  })
  return tgpu.resolve([dispatched.at(-1)] as never, {
    names: 'strict',
    config: (config) => config.with(legacyRandomOutputSlot, false),
  })
}

/** A flame's first transform, running only `type`. */
function transformsUsing(type: string, base: TransformRecord): TransformRecord {
  const [tid, transform] = recordEntries(base)[0]!
  return {
    [tid]: {
      ...transform,
      variations: {
        [generateVariationId()]: { type, weight: 1, visible: true },
      },
    },
  }
}

const BEFORE = 'return vec2f(pos.x * 1.375, pos.y);'
const AFTER = 'return vec2f(pos.x * 2.625, pos.y);'

let created: string[] = []
afterEach(() => {
  for (const id of created) deleteCustomVariation(id)
  created = []
})

describe.each([
  [2, examples.example2.transforms],
  [3, examples.example40.transforms],
] as const)('the %dD IFS pipeline', (dimensions, base) => {
  it('runs the new code of a custom variation edited in place, once rebuilt', () => {
    const made = createCustomVariation('Stretch', BEFORE)
    if (!made.success) throw new Error(JSON.stringify(made.errors))
    created.push(made.def.id)
    const transforms = transformsUsing(made.def.id, base)
    const root = recordingRoot()

    const before = runPipeline(dimensions, root, transforms)
    expect(before).toContain('1.375')

    const edited = updateCustomVariation(made.def.id, AFTER)
    if (!edited.success) throw new Error(JSON.stringify(edited.errors))
    const after = runPipeline(dimensions, root, transforms)

    expect(after).toContain('2.625')
    expect(after).not.toContain('1.375')
  })
})
