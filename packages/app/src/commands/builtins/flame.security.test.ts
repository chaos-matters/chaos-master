import './flame'
import './generate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { MAX_FLAME_TRANSFORMS, MAX_VARIATIONS_PER_TRANSFORM, validateFlame, } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { executeReplayCommand, getCommand, preflightReplayCommand, } from '../registry'
import type { CommandContext, FlameCommand } from '../types'
import type { FlameDescriptor, TransformId, VariationId, } from '@/flame/schema/flameSchema'

const identity = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }

function makeTransform(index: number, variationCount = 1) {
  return {
    probability: 1,
    preAffine: identity,
    postAffine: identity,
    color: { x: 0, y: 0 },
    variations: Object.fromEntries(
      Array.from({ length: variationCount }, (_, variationIndex) => [
        `v_${index}_${variationIndex}`,
        { type: 'linearVar', weight: 1 },
      ]),
    ),
  }
}

function makeFlame(transformCount: number, variationCount = 1) {
  return validateFlame({
    transforms: Object.fromEntries(
      Array.from({ length: transformCount }, (_, index) => [
        `t_${index}`,
        makeTransform(index, variationCount),
      ]),
    ),
  })
}

function makeContext(initial: FlameDescriptor) {
  let flame = deepClone(initial)
  let writes = 0
  const setFlameDescriptor = ((
    updater: FlameDescriptor | ((draft: FlameDescriptor) => unknown),
  ) => {
    if (typeof updater === 'function') {
      const draft = deepClone(flame)
      const replacement = updater(draft)
      flame = (replacement ?? draft) as FlameDescriptor
    } else {
      flame = deepClone(updater)
    }
    writes++
  }) as CommandContext['setFlameDescriptor']

  const ctx = {
    flameDescriptor: () => flame,
    setFlameDescriptor,
  } as unknown as CommandContext
  return {
    ctx,
    flame: () => flame,
    writes: () => writes,
  }
}

function command(id: string): FlameCommand {
  const result = getCommand(id)
  if (!result) throw new Error(`missing command ${id}`)
  return result
}

function generatorConfig(overrides: Record<string, unknown> = {}) {
  return {
    strength: 0.5,
    minTransforms: 1,
    maxTransforms: 10,
    minVariations: 1,
    maxVariations: 10,
    allowedVariations: [],
    dimensions: 2,
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('bounded flame entity commands', () => {
  it('applies an export metadata patch as one semantic document write', () => {
    const world = makeContext(deepClone(examples.initExample))
    const setMetadata = command('flame.setMetadata')

    expect(
      preflightReplayCommand('flame.setMetadata', [
        { name: 'New name', author: 'Grace' },
      ]),
    ).toBeUndefined()
    setMetadata.execute(world.ctx, { name: 'New name', author: 'Grace' })

    expect(world.writes()).toBe(1)
    expect(world.flame().metadata).toMatchObject({
      name: 'New name',
      author: 'Grace',
    })
    expect(
      preflightReplayCommand('flame.setMetadata', [
        { name: 'Valid', constructor: 'hostile' },
      ]),
    ).toBeDefined()
  })

  it('allows repeated transform adds through the boundary, then stops', () => {
    const world = makeContext(makeFlame(0))
    const add = command('flame.addTransform')

    for (let i = 0; i < MAX_FLAME_TRANSFORMS; i++) {
      add.execute(world.ctx, 'linearVar', `added_t_${i}`, `added_v_${i}`)
    }
    expect(Object.keys(world.flame().transforms)).toHaveLength(
      MAX_FLAME_TRANSFORMS,
    )

    add.execute(world.ctx, 'linearVar', 'one_too_many', 'one_too_many_v')
    expect(Object.keys(world.flame().transforms)).toHaveLength(
      MAX_FLAME_TRANSFORMS,
    )
  })

  it('rejects unsafe, reserved, colliding and dimension-mismatched adds', () => {
    const world = makeContext(deepClone(examples.initExample))
    const addTransform = command('flame.addTransform')
    const before = deepClone(world.flame())

    addTransform.execute(world.ctx, 'linearVar', '__proto__', 'safe_v')
    addTransform.execute(world.ctx, 'linearVar', '_sym__reserved', 'safe_v')
    addTransform.execute(world.ctx, 'linear3D', 'safe_t', 'safe_v')
    const existingId = Object.keys(world.flame().transforms)[0]!
    addTransform.execute(world.ctx, 'linearVar', existingId, 'safe_v')

    expect(world.flame()).toEqual(before)
    expect(
      addTransform.validateReplayArgs?.(['linearVar', 'unsafe-id', 'safe_v']),
    ).toBeDefined()
  })

  it('enforces variation ids, types, collisions and the local cap', () => {
    const world = makeContext(deepClone(examples.initExample))
    const add = command('flame.addVariation')
    const transformId = Object.keys(world.flame().transforms)[0]! as TransformId
    const transform = world.flame().transforms[transformId]!
    const existingId = Object.keys(transform.variations)[0]! as VariationId
    const existing = deepClone(transform.variations[existingId]!)

    add.execute(world.ctx, transformId, 'swirlVar', existingId)
    add.execute(world.ctx, transformId, 'linear3D', 'wrong_dimension')
    add.execute(world.ctx, transformId, 'linearVar', 'unsafe-id')
    expect(transform.variations[existingId]).toEqual(existing)

    for (
      let i = Object.keys(
        world.flame().transforms[transformId]!.variations,
      ).length;
      i < MAX_VARIATIONS_PER_TRANSFORM;
      i++
    ) {
      add.execute(world.ctx, transformId, 'linearVar', `added_v_${i}`)
    }
    expect(
      Object.keys(world.flame().transforms[transformId]!.variations),
    ).toHaveLength(MAX_VARIATIONS_PER_TRANSFORM)

    add.execute(world.ctx, transformId, 'linearVar', 'one_too_many')
    expect(
      Object.keys(world.flame().transforms[transformId]!.variations),
    ).toHaveLength(MAX_VARIATIONS_PER_TRANSFORM)
  })

  it('validates whole-variation replacements before they reach state', () => {
    const world = makeContext(deepClone(examples.initExample))
    const transformId = Object.keys(world.flame().transforms)[0]! as TransformId
    const variationId = Object.keys(
      world.flame().transforms[transformId]!.variations,
    )[0]! as VariationId
    const before = deepClone(world.flame())
    const setVariation = command('flame.setVariation')
    const applySelection = command('flame.applyVariationSelection')

    setVariation.execute(world.ctx, transformId, variationId, {
      type: 'constructor',
      weight: 1,
    })
    setVariation.execute(world.ctx, transformId, variationId, {
      type: 'linear3D',
      weight: 1,
    })
    setVariation.execute(world.ctx, transformId, variationId, {
      type: 'linearVar',
      weight: 'not-a-number',
    })
    applySelection.execute(world.ctx, transformId, variationId, identity, {
      type: 'linear3D',
      weight: 1,
    })

    expect(world.flame()).toEqual(before)
    expect(
      setVariation.validateReplayArgs?.([
        transformId,
        variationId,
        { type: 'constructor', weight: 1 },
      ]),
    ).toBeDefined()
    expect(
      setVariation.validateReplayArgs?.([
        transformId,
        variationId,
        { type: 'linearVar', weight: 1 },
        'randomize',
      ]),
    ).toBeUndefined()
    expect(
      setVariation.validateReplayArgs?.([
        transformId,
        variationId,
        { type: 'linearVar', weight: 1 },
        'hostile-origin',
      ]),
    ).toBeDefined()

    setVariation.execute(world.ctx, transformId, variationId, {
      type: 'swirlVar',
      weight: 0.75,
    })
    expect(
      world.flame().transforms[transformId]!.variations[variationId]!.type,
    ).toBe('swirlVar')
  })

  it('applies one final-affine coefficient and rejects malformed replay data', () => {
    const world = makeContext(deepClone(examples.initExample))
    command('flame.setFinalTransform').execute(world.ctx, identity)

    expect(
      executeReplayCommand('flame.setFinalAffine', world.ctx, 'e', 0.25),
    ).toBe(true)
    expect(world.flame().finalTransform?.e).toBe(0.25)

    const before = deepClone(world.flame())
    expect(
      executeReplayCommand('flame.setFinalAffine', world.ctx, '__proto__', 1),
    ).toBe(false)
    expect(world.flame()).toEqual(before)
  })

  it('requires symmetry ids to be safe, reserved and unique', () => {
    const symmetry = command('flame.applySymmetry')
    expect(
      symmetry.validateReplayArgs?.([
        2,
        'rotational',
        [['ordinary_id', 'safe_v']],
      ]),
    ).toMatch(/reserved/)
    expect(
      symmetry.validateReplayArgs?.([
        3,
        'rotational',
        [
          ['_sym__same', 'safe_v_1'],
          ['_sym__same', 'safe_v_2'],
        ],
      ]),
    ).toMatch(/unique/)
    expect(
      symmetry.validateReplayArgs?.([
        2,
        'rotational',
        [['_sym__safe', 'constructor']],
      ]),
    ).toMatch(/unsafe/)

    const world = makeContext(deepClone(examples.initExample))
    symmetry.execute(world.ctx, 4, 'rotational', [
      ['_sym__one', 'sym_v_one'],
      ['_sym__two', 'sym_v_two'],
      ['_sym__three', 'sym_v_three'],
    ])
    expect(
      Object.keys(world.flame().transforms).filter((id) =>
        id.startsWith('_sym__'),
      ),
    ).toEqual(['_sym__one', '_sym__two', '_sym__three'])
  })

  it('rejects a symmetry expansion that would exceed the shared graph cap', () => {
    const world = makeContext(makeFlame(100))
    const symmetry = command('flame.applySymmetry')
    const pairs = Array.from({ length: 63 }, (_, index) => [
      `_sym__t_${index}`,
      `sym_v_${index}`,
    ])

    symmetry.execute(world.ctx, 64, 'rotational', pairs)
    expect(Object.keys(world.flame().transforms)).toHaveLength(100)
    expect(
      Object.keys(world.flame().transforms).some((id) =>
        id.startsWith('_sym__'),
      ),
    ).toBe(false)
  })

  it('rejects malformed palette data before it reaches flame state', () => {
    const world = makeContext(deepClone(examples.initExample))
    const before = deepClone(world.flame())
    const malformed = {
      id: 'hostile-palette',
      name: 'Hostile',
      source: 'custom',
      entries: [{ id: 'stop-1', position: 0, a: 'not-a-number', b: 0 }],
    }

    expect(
      preflightReplayCommand('flame.applyPalette', [malformed]),
    ).toBeDefined()
    expect(
      executeReplayCommand('flame.applyPalette', world.ctx, malformed),
    ).toBe(false)
    expect(world.writes()).toBe(0)
    expect(world.flame()).toEqual(before)
  })
})

describe('bounded generator replay configuration', () => {
  it('accepts 10 by 10 and requires explicit dimensions', () => {
    const randomize = command('flame.randomize')
    expect(
      randomize.validateReplayArgs?.([42, generatorConfig()]),
    ).toBeUndefined()
    expect(
      randomize.validateReplayArgs?.([
        42,
        generatorConfig({ dimensions: undefined }),
      ]),
    ).toBeDefined()
  })

  it('rejects either generator axis above ten and unknown fields', () => {
    const randomize = command('flame.randomize')
    expect(
      randomize.validateReplayArgs?.([
        42,
        generatorConfig({ maxTransforms: 11 }),
      ]),
    ).toBeDefined()
    expect(
      randomize.validateReplayArgs?.([
        42,
        generatorConfig({ maxVariations: 11 }),
      ]),
    ).toBeDefined()
    expect(
      randomize.validateReplayArgs?.([42, generatorConfig({ surprise: true })]),
    ).toBeDefined()
  })

  it('validates allowed variations against the declared dimension', () => {
    const randomize = command('flame.randomize')
    expect(
      randomize.validateReplayArgs?.([
        42,
        generatorConfig({ allowedVariations: ['linear3D'] }),
      ]),
    ).toBeDefined()
    expect(
      randomize.validateReplayArgs?.([
        42,
        generatorConfig({
          dimensions: 3,
          allowedVariations: ['linear3D'],
        }),
      ]),
    ).toBeUndefined()
  })
})
