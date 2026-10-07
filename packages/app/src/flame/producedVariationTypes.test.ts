// Guards what the flame producers make: every variation they write is a type
// registered for the flame's dimension, under an id that is not its type.
//
// #117: the symmetry buttons wrote `is3D ? 'linear3D' : 'linear'`, and 2D has
// no 'linear' (it is 'linearVar'), so the renderer skipped every symmetry
// transform's variation and sent its points to the origin. The fixture scan
// (fixtureRealism.test.ts) cannot see a type assembled in an expression, so
// this runs the producers and reads what they return:
//   symmetry (rotational and dihedral, 2 to 8 folds), the randomizer, a new
//   transform, mutation (both variation modes, every type swapped), crossover
//   (every mode), the Arena's archetype opponents, the bundled examples, and
//   the loaders (.flame JSON through validateFlame, flam3 XML, a share link).
//
// Every producer passes: the last known failures, the 3D archetype opponents
// built from 2D names, went with #121.
import { VARIATION_TYPE_MIGRATIONS } from '@chaos-master/core'
import { describe, expect, it } from 'vitest'
import { generateDefaults } from '@/commands/builtins/generate'
import goldenShareLink from '@/utils/__fixtures__/share-link-v0.9.11.json'
import { deepClone } from '@/utils/clone'
import { decodeSharePayload } from '@/utils/jsonQueryParam'
import { ARCHETYPE_IDS, generateArchetypeOpponent, } from '@/webmcp/tools/arenaArchetypes'
import { breedFlames, CROSSOVER_MODES } from './breedFlame'
import { examples } from './examples'
import { FLAM3_SAMPLES } from './flam3Samples'
import { parseFlameXml } from './flameXml'
import { newDefaultTransform } from './newTransform'
import { createSeededRandomSource, generateSeededRandomFlame, mutateFlameSeeded, withRandomSource, } from './randomize'
import { validateFlame } from './schema/flameSchema'
import { applySymmetryToFlame } from './symmetry'
import { isVariationTypeFor } from './variationRegistry'
import type { MutateFlameOptions } from './mutationRates'
import type { FlameDescriptor, TransformId } from './schema/flameSchema'
import type { Dims } from './variationRegistry'

type Produced = { producer: string; flame: FlameDescriptor }

const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34]
const dimsOf = (flame: FlameDescriptor): Dims =>
  flame.renderSettings.dimensions === 3 ? 3 : 2
const CUSTOM_TYPE =
  /^custom_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/

const BASE = { 2: examples.example1, 3: examples.example30 } as const
const PARTNER = { 2: examples.example5, 3: examples.example31 } as const

/** What is wrong with the variations of one produced flame, deduplicated. */
function findings({ producer, flame }: Produced): string[] {
  const dims = dimsOf(flame)
  const out = new Set<string>()
  for (const transform of Object.values(flame.transforms)) {
    for (const [id, { type }] of Object.entries(transform.variations)) {
      if (!isVariationTypeFor(dims, type) && !CUSTOM_TYPE.test(type)) {
        out.add(`${producer}: ${type} is not a ${dims}D type`)
      }
      if (id === type) out.add(`${producer}: id equals its type ${type}`)
    }
  }
  return [...out]
}

function symmetry(): Produced[] {
  return ([2, 3] as const).flatMap((dims) =>
    (['rotational', 'dihedral'] as const).flatMap((mode) =>
      [2, 3, 4, 5, 6, 7, 8].map((folds) => ({
        producer: `symmetry ${dims}D`,
        flame: applySymmetryToFlame(BASE[dims], folds, mode),
      })),
    ),
  )
}

function randomizer(): Produced[] {
  return ([2, 3] as const).flatMap((dims) =>
    SEEDS.map((seed) => ({
      producer: `randomizer ${dims}D`,
      flame: generateSeededRandomFlame(generateDefaults(dims), seed),
    })),
  )
}

function newTransform(): Produced[] {
  return ([2, 3] as const).map((dims) => {
    const flame = deepClone(BASE[dims])
    flame.transforms['added' as TransformId] = newDefaultTransform(dims)
    return { producer: `new transform ${dims}D`, flame }
  })
}

function mutation(): Produced[] {
  const options = (
    mutateVariations: MutateFlameOptions['mutateVariations'],
  ): MutateFlameOptions => ({
    mutateAffine: true,
    affineMode: 'smart',
    mutateVariations,
    variationSwapChance: 1,
    mutateColors: true,
    addTransformChance: 1,
    removeTransformChance: 0,
  })
  return ([2, 3] as const).flatMap((dims) =>
    (['modify', 'all'] as const).flatMap((mode) =>
      SEEDS.map((seed) => ({
        producer: `mutation ${dims}D`,
        flame: mutateFlameSeeded(
          BASE[dims],
          generateDefaults(dims),
          options(mode),
          seed,
        ),
      })),
    ),
  )
}

function crossover(): Produced[] {
  return ([2, 3] as const).flatMap((dims) =>
    CROSSOVER_MODES.flatMap((crossoverMode) =>
      SEEDS.slice(0, 3).flatMap((seed) =>
        withRandomSource(createSeededRandomSource(seed), () =>
          breedFlames(BASE[dims], PARTNER[dims], {
            count: 4,
            crossoverMode,
            mutationStrength: 0.5,
          }),
        ).map((flame) => ({ producer: `crossover ${dims}D`, flame })),
      ),
    ),
  )
}

function archetypes(): Produced[] {
  return ([2, 3] as const).flatMap((dims) =>
    ARCHETYPE_IDS.map((id) => ({
      producer: `archetype ${dims}D`,
      flame: generateArchetypeOpponent(BASE[dims], id, 7).flame,
    })),
  )
}

function bundled(): Produced[] {
  return Object.entries(examples).map(([name, flame]) => ({
    producer: `example ${name}`,
    flame,
  }))
}

/** A .flame saved before the renames: one transform per legacy name. */
function legacyFile(): Produced {
  const flame = deepClone(BASE[2])
  const [template] = Object.values(flame.transforms)
  flame.transforms = Object.fromEntries(
    Object.keys(VARIATION_TYPE_MIGRATIONS).map((legacy, index) => [
      `t${index}`,
      {
        ...deepClone(template!),
        variations: { v0: { type: legacy, weight: 1 } },
      },
    ]),
  )
  return {
    producer: 'load .flame',
    flame: validateFlame(JSON.parse(JSON.stringify(flame))),
  }
}

function flam3(): Produced[] {
  return FLAM3_SAMPLES.map((sample) => ({
    producer: 'load flam3 XML',
    flame: parseFlameXml(sample.xml),
  }))
}

describe('what the flame producers write', () => {
  it('is a variation type registered for its dimension, keyed by an id', async () => {
    const produced: Produced[] = [
      ...symmetry(),
      ...randomizer(),
      ...newTransform(),
      ...mutation(),
      ...crossover(),
      ...archetypes(),
      ...bundled(),
      legacyFile(),
      ...flam3(),
      {
        producer: 'load share link',
        flame: (await decodeSharePayload(goldenShareLink.golden)).flame,
      },
    ]
    expect([...new Set(produced.flatMap(findings))].sort()).toEqual([])
  })

  it('covers every producer with flames of both dimensions', () => {
    const groups = [
      symmetry,
      randomizer,
      newTransform,
      mutation,
      crossover,
      archetypes,
    ]
    expect(
      groups.map((group) =>
        [...new Set(group().map((p) => dimsOf(p.flame)))].sort(),
      ),
    ).toEqual(groups.map(() => [2, 3]))
  })
})
