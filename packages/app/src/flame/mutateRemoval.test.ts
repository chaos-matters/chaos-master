// Mutate's remove-transform chance removes transforms, within the transform range, and never a symmetry copy.
import { describe, expect, it } from 'vitest'
import { recordEntries } from '@/utils/record'
import { examples } from './examples'
import { mutateFlame, mutateFlameSeeded, MUTATION_PRESETS } from './randomize'
import type { GenerateRandomFlameConfig, MutateFlameOptions, MutationPresetName, } from './mutationRates'
import type { FlameDescriptor } from './schema/flameSchema'

const config: GenerateRandomFlameConfig = {
  strength: 0.5,
  minTransforms: 2,
  maxTransforms: 8,
  minVariations: 1,
  maxVariations: 3,
  allowedVariations: [],
  dimensions: 2,
}

const base: MutateFlameOptions = {
  mutateAffine: true,
  affineMode: 'smart',
  mutateVariations: 'modify',
  mutateColors: true,
}

/** `count` user transforms t0..t(count-1), plus `extra` transforms as given. */
function flameWith(
  count: number,
  extra: FlameDescriptor['transforms'] = {},
): FlameDescriptor {
  const source = recordEntries(examples.example1.transforms)
  const transforms = Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `t${i}`,
      source[i % source.length]![1],
    ]),
  )
  return {
    ...examples.example1,
    transforms: { ...transforms, ...extra },
  }
}

const ids = (flame: FlameDescriptor) => Object.keys(flame.transforms)
const userIds = (flame: FlameDescriptor) =>
  ids(flame).filter((tid) => !tid.startsWith('_sym__'))
const symIds = (flame: FlameDescriptor) =>
  ids(flame).filter((tid) => tid.startsWith('_sym__'))

describe('mutateFlame removes transforms at the remove chance', () => {
  it('removes transforms, down to minTransforms and no further', () => {
    const always = { ...base, removeTransformChance: 1 }
    const mutated = mutateFlameSeeded(flameWith(6), config, always, 1)
    expect(userIds(mutated)).toHaveLength(config.minTransforms)
    // The survivors are original transforms, not new ones.
    for (const tid of userIds(mutated)) expect(tid).toMatch(/^t\d$/)
  })

  it('never removes the last transform, whatever minTransforms says', () => {
    const always = { ...base, removeTransformChance: 1 }
    const mutated = mutateFlame(
      flameWith(3),
      { ...config, minTransforms: 0 },
      always,
    )
    expect(userIds(mutated)).toHaveLength(1)
  })

  it('never removes a symmetry copy, and does not count the copies', () => {
    // example26: one user transform and four `_sym__` copies of the mandala.
    const copies = Object.fromEntries(
      recordEntries(examples.example26.transforms).filter(([tid]) =>
        tid.startsWith('_sym__'),
      ),
    )
    const always = { ...base, removeTransformChance: 1 }
    const mutated = mutateFlameSeeded(
      flameWith(4, copies),
      { ...config, minTransforms: 1 },
      always,
      3,
    )
    expect(userIds(mutated)).toHaveLength(1)
    expect(symIds(mutated).sort()).toEqual(Object.keys(copies).sort())
  })

  it('removes only selected transforms when a selection is given', () => {
    const always = {
      ...base,
      removeTransformChance: 1,
      selectedTransformIds: ['t1', 't3'],
    }
    const mutated = mutateFlameSeeded(
      flameWith(5),
      { ...config, minTransforms: 1 },
      always,
      5,
    )
    expect(userIds(mutated).sort()).toEqual(['t0', 't2', 't4'])
  })

  it('is deterministic per seed', () => {
    const structural = { ...base, ...MUTATION_PRESETS.Structural }
    for (let seed = 0; seed < 10; seed++) {
      expect(mutateFlameSeeded(flameWith(6), config, structural, seed)).toEqual(
        mutateFlameSeeded(flameWith(6), config, structural, seed),
      )
    }
  })

  // Each preset over 300 seeds of a six-transform flame: the share of its
  // transforms a Mutate removes follows the preset's chance.
  describe.each(Object.keys(MUTATION_PRESETS) as MutationPresetName[])(
    'the %s preset',
    (name) => {
      const preset = MUTATION_PRESETS[name]
      const options = { ...base, ...preset }
      const seeds = 300
      const original = flameWith(6)
      let removed = 0
      let belowMin = 0
      for (let seed = 0; seed < seeds; seed++) {
        const mutated = mutateFlameSeeded(original, config, options, seed)
        const survivors = new Set(ids(mutated))
        removed += ids(original).filter((tid) => !survivors.has(tid)).length
        if (userIds(mutated).length < config.minTransforms) belowMin++
      }
      const share = removed / (seeds * 6)

      it(`removes about ${preset.removeTransformChance} of the transforms`, () => {
        if (preset.removeTransformChance === 0) {
          expect(removed).toBe(0)
        } else {
          expect(share).toBeGreaterThan(preset.removeTransformChance * 0.7)
          expect(share).toBeLessThan(preset.removeTransformChance * 1.3)
        }
      })

      it('never leaves fewer than minTransforms', () => {
        expect(belowMin).toBe(0)
      })
    },
  )
})
