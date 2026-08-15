import '@/commands/builtins/flame'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { deepClone } from '@/utils/clone'
import { editorProps } from './types'
import type { EditorProps } from './types'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor, TransformId, VariationId, } from '@/flame/schema/flameSchema'

function makeVariationWorld() {
  let flame = deepClone(examples.initExample)
  const transformId = Object.keys(flame.transforms)[0]! as TransformId
  const variationId = Object.keys(
    flame.transforms[transformId]!.variations,
  )[0]! as VariationId

  flame.transforms[transformId]!.variations[variationId] = {
    type: 'checksVar',
    weight: 1,
    visible: true,
    params: { x: 3, y: 3, size: 1, rnd: 0.5 },
  }

  const setFlameDescriptor = ((
    updater: FlameDescriptor | ((draft: FlameDescriptor) => unknown),
  ) => {
    if (typeof updater === 'function') {
      const draft = deepClone(flame)
      const replacement = updater(draft)
      flame = (replacement ?? draft) as FlameDescriptor
      return
    }
    flame = deepClone(updater)
  }) as CommandContext['setFlameDescriptor']

  const ctx = {
    flameDescriptor: () => flame,
    setFlameDescriptor,
  } as unknown as CommandContext

  return {
    ctx,
    flame: () => flame,
    transformId,
    variationId,
  }
}

describe('parametric editor field routing', () => {
  it('records a scalar edit as the exact variation parameter and focus target', () => {
    const world = makeVariationWorld()
    const params = {
      x: 3,
      y: 3,
      size: 1,
      rnd: 0.5,
    }
    const replaceWholeParams = vi.fn()
    const rootProps: EditorProps<typeof params> = {
      value: params,
      setValue: replaceWholeParams,
      setParamValue: (key, value) => {
        executeCommand(
          'flame.setVariationParams',
          world.ctx,
          world.transformId,
          world.variationId,
          key,
          value,
        )
      },
      dataParameterPath: `${world.transformId}.${world.variationId}`,
    }
    const sizeEditor = editorProps(rootProps, 'size', 'Size')

    startSessionRecording(world.flame())
    sizeEditor.setValue(2.25)
    const session = stopSessionRecording()

    expect(replaceWholeParams).not.toHaveBeenCalled()
    expect(
      world.flame().transforms[world.transformId]!.variations[
        world.variationId
      ],
    ).toMatchObject({ params: { size: 2.25 } })
    expect(sizeEditor.dataParameterPath).toBe(
      `${world.transformId}.${world.variationId}.size`,
    )
    expect(session?.actions).toEqual([
      expect.objectContaining({
        id: 'flame.setVariationParams',
        args: [world.transformId, world.variationId, 'size', 2.25],
        focus: `param:${world.transformId}.${world.variationId}.size`,
      }),
    ])
  })

  it('keeps the whole-object update for callers without scalar routing', () => {
    const replaceWholeParams = vi.fn()
    const rootProps: EditorProps<{ x: number; y: number }> = {
      value: { x: 1, y: 2 },
      setValue: replaceWholeParams,
    }

    editorProps(rootProps, 'x', 'X').setValue(4)

    expect(replaceWholeParams).toHaveBeenCalledOnce()
    expect(replaceWholeParams).toHaveBeenCalledWith({ x: 4, y: 2 })
  })
})

afterEach(() => {
  cancelSessionRecording()
})
