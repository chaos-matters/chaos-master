// One Mutate is one history entry: Undo brings back the transforms it removed.
import '@/commands/builtins'
import { createStore } from 'solid-js/store'
import { describe, expect, it } from 'vitest'
import { executeCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { mutateFlameSeeded, MUTATION_PRESETS } from '@/flame/randomize'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { recordEntries } from '@/utils/record'
import { createMockCommandContext } from '@/webmcp/testUtils'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

function sixTransforms(): FlameDescriptor {
  const source = recordEntries(examples.example1.transforms)
  return deepClone({
    ...examples.example1,
    transforms: Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [
        `t${i}`,
        source[i % source.length]![1],
      ]),
    ),
  })
}

describe('flame.mutate and Undo', () => {
  it('restores every removed transform with one Undo', () => {
    const original = sixTransforms()
    const [flame, setFlame, history] = createStoreHistory(
      createStore<FlameDescriptor>(deepClone(original)),
    )
    const ctx = {
      ...createMockCommandContext(),
      flameDescriptor: () => flame,
      setFlameDescriptor: setFlame,
    }

    const config = {
      strength: 0.5,
      minTransforms: 2,
      maxTransforms: 8,
      minVariations: 1,
      maxVariations: 3,
      allowedVariations: [],
      dimensions: 2 as const,
    }
    const options = {
      mutateAffine: true,
      affineMode: 'smart' as const,
      mutateVariations: 'modify' as const,
      mutateColors: true,
      ...MUTATION_PRESETS.Structural,
      // The command's ceiling for the chance; no additions, so the count
      // shows the removals alone.
      removeTransformChance: 0.3,
      addTransformChance: 0,
    }
    // The first seed whose Mutate removes something.
    const seed = Array.from({ length: 50 }, (_, i) => i).find(
      (s) =>
        Object.keys(mutateFlameSeeded(original, config, options, s).transforms)
          .length < 6,
    )
    expect(seed).toBeDefined()

    executeCommand('flame.mutate', ctx, seed, config, options)
    const after = Object.keys(flame.transforms)
    expect(after.length).toBeLessThan(6)
    expect(after.length).toBeGreaterThanOrEqual(2)

    history.undo()
    expect(history.hasUndo()).toBe(false)
    expect(Object.keys(flame.transforms).sort()).toEqual(
      Object.keys(original.transforms).sort(),
    )
    expect(deepClone(flame)).toEqual(original)
  })
})
