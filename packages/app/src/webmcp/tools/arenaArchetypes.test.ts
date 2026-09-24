import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { initExample } from '@/flame/examples/initExample'
import { initExample3D } from '@/flame/examples/initExample3D'
import { transformVariations } from '@/flame/variations'
import { transformVariations3D } from '@/flame/variations3D'
import { ARCHETYPE_IDS, ARENA_ARCHETYPES, generateArchetypeOpponent, TACTICAL_STANCES, } from './arenaArchetypes'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

describe('arenaArchetypes', () => {
  const baseFlame: FlameDescriptor = {
    version: '1',
    metadata: { name: 'Base Fighter' },
    renderSettings: {
      exposure: 0.5,
      vibrancy: 0.5,
      dimensions: 3,
      palettePhase: 0.1,
    },
    transforms: {
      t1: {
        weight: 1,
        color: 0.2,
        colorSpeed: 0.5,
        affine: {
          a: 1,
          b: 0,
          c: 0,
          d: 0,
          e: 1,
          f: 0,
          g: 0,
          h: 0,
          i: 0,
          j: 0,
          k: 1,
          l: 0,
        },
        variations: { spherical: { weight: 1 } },
        visible: true,
      },
      t2: {
        weight: 1,
        color: 0.8,
        colorSpeed: 0.5,
        affine: {
          a: 0.5,
          b: 0,
          c: 0,
          d: 0,
          e: 0.5,
          f: 0,
          g: 0,
          h: 0,
          i: 0,
          j: 0,
          k: 0.5,
          l: 0,
        },
        variations: { swirl: { weight: 0.8 } },
        visible: true,
      },
    },
  } as unknown as FlameDescriptor

  it('defines 6 balanced procedural archetypes with lore', () => {
    expect(ARCHETYPE_IDS.length).toBe(6)
    for (const id of ARCHETYPE_IDS) {
      const arch = ARENA_ARCHETYPES[id]
      expect(arch.id).toBe(id)
      expect(arch.name.length).toBeGreaterThan(0)
      expect(arch.className.length).toBeGreaterThan(0)
      expect(arch.lore.length).toBeGreaterThan(10)
      expect(arch.allowedVariations.length).toBeGreaterThan(0)
    }
  })

  // Regression guard: the archetype pools once held bare Apophysis names
  // ("cross", "polar", "julia"), none of which exist in the registry — the
  // generated opponents carried variation types the shader compiler could not
  // resolve, and every clash logged
  //   [createFlameWgsl] skipping unsupported variation type "cross"
  // then saved the broken flame to Recents so it resurfaced on every reload.
  it('only lists variation names that exist in the live registries', () => {
    const known = new Set([
      ...Object.keys(transformVariations),
      ...Object.keys(transformVariations3D),
    ])
    const unknown = ARCHETYPE_IDS.flatMap((id) =>
      ARENA_ARCHETYPES[id].allowedVariations
        .filter((name) => !known.has(name))
        .map((name) => `${id}: ${name}`),
    )
    expect(unknown).toEqual([])
  })

  // A 3D opponent drawn from the 2D pool carried 2D variation types, which the
  // 3D renderer runs as a flat 2D map with z passed through: the opponents
  // rendered nearly black (lit coverage 0.000-0.024 in the Arcade audit).
  it('lists, for each dimension, only variation types registered for it', () => {
    const misfiled = ARCHETYPE_IDS.flatMap((id) => {
      const arch = ARENA_ARCHETYPES[id]
      return [
        ...arch.allowedVariations
          .filter((name) => !(name in transformVariations))
          .map((name) => `${id} 2D: ${name}`),
        ...arch.allowedVariations3D
          .filter((name) => !(name in transformVariations3D))
          .map((name) => `${id} 3D: ${name}`),
      ]
    })
    expect(misfiled).toEqual([])
    for (const id of ARCHETYPE_IDS) {
      expect(ARENA_ARCHETYPES[id].allowedVariations3D.length).toBeGreaterThan(2)
    }
  })

  it('builds a 3D opponent from registered 3D variation types only', () => {
    for (const id of ARCHETYPE_IDS) {
      for (const seed of [1, 42, 999]) {
        const { flame } = generateArchetypeOpponent(initExample3D, id, seed)
        const types = Object.values(flame.transforms).flatMap((t) =>
          Object.values(t.variations).map((v) => v.type),
        )
        expect(types.length).toBeGreaterThan(0)
        expect(
          types.filter((type) => !(type in transformVariations3D)),
          `${id} seed ${seed}`,
        ).toEqual([])
      }
    }
  })

  // A one-transform base (a fresh project, 2D or 3D) mutated into a
  // one-transform opponent, which rendered nearly black. Such a base is not
  // mutated: the opponent is rolled fresh from the archetype's recipe, in
  // the base's dimension and under its render settings (no camera fitting).
  it('rolls a fresh opponent from the archetype for a base below two transforms', () => {
    for (const base of [initExample3D, initExample]) {
      const dims = base.renderSettings.dimensions ?? 2
      expect(Object.keys(base.transforms)).toHaveLength(1)
      for (const id of ARCHETYPE_IDS) {
        const pool: string[] =
          dims === 3
            ? ARENA_ARCHETYPES[id].allowedVariations3D
            : ARENA_ARCHETYPES[id].allowedVariations
        for (const seed of [1, 42, 999]) {
          const label = `${dims}D ${id} seed ${seed}`
          const { flame } = generateArchetypeOpponent(base, id, seed)
          const transforms = Object.values(flame.transforms)
          expect(transforms.length, label).toBeGreaterThanOrEqual(2)
          expect(transforms.length, label).toBeLessThanOrEqual(5)
          const types = transforms.flatMap((t) =>
            Object.values(t.variations).map((v) => v.type),
          )
          expect(
            types.filter((type) => !pool.includes(type)),
            label,
          ).toEqual([])
          expect(flame.renderSettings, label).toEqual({
            ...base.renderSettings,
            palettePhase: ARENA_ARCHETYPES[id].paletteHue,
          })
          expect(flame.metadata.name, label).toBe(ARENA_ARCHETYPES[id].name)
        }
      }
    }
    expect(generateArchetypeOpponent(initExample3D, 'chaos_lord', 7)).toEqual(
      generateArchetypeOpponent(initExample3D, 'chaos_lord', 7),
    )
  })

  // example26 is one user transform and four symmetry copies: to the
  // transform list, and to the fresh-roll check, that is one transform.
  it('rolls fresh for a base whose only company is symmetry copies', () => {
    const base = examples.example26
    const pool: string[] = ARENA_ARCHETYPES.chaos_lord.allowedVariations
    for (const seed of [1, 42, 999]) {
      const { flame } = generateArchetypeOpponent(base, 'chaos_lord', seed)
      const types = Object.values(flame.transforms).flatMap((t) =>
        Object.values(t.variations).map((v) => v.type),
      )
      expect(
        types.filter((type) => !pool.includes(type)),
        `seed ${seed}`,
      ).toEqual([])
      expect(
        Object.keys(flame.transforms).filter((tid) => tid.startsWith('_sym__')),
      ).toEqual([])
    }
  })

  it('still mutates a base with two transforms or more', () => {
    const { flame } = generateArchetypeOpponent(baseFlame, 'chaos_lord', 42)
    expect(Object.keys(flame.transforms)).toEqual(
      expect.arrayContaining(['t1', 't2']),
    )
  })

  it('defines tactical stances with distinct stat multipliers', () => {
    expect(TACTICAL_STANCES.balanced.effects.energyMultiplier).toBe(1.0)
    expect(TACTICAL_STANCES.resonance.effects.energyMultiplier).toBeGreaterThan(
      1.0,
    )
    expect(TACTICAL_STANCES.bastion.effects.symmetryMultiplier).toBeGreaterThan(
      1.0,
    )
    expect(TACTICAL_STANCES.entropy.effects.chaosMultiplier).toBeGreaterThan(
      1.0,
    )
  })

  it('generates procedural archetype opponent with valid flame and stats', () => {
    const opponent = generateArchetypeOpponent(baseFlame, 'chaos_lord', 42)
    expect(opponent.archetype.id).toBe('chaos_lord')
    expect(opponent.name).toBe('Xul the Entropic')
    expect(opponent.className).toBe('Chaos Lord')
    expect(opponent.powerLevel).toBeGreaterThan(0)
    expect(opponent.flame.transforms).toBeDefined()
    expect(opponent.metrics.complexity).toBeGreaterThan(0)
  })

  it('generates deterministic opponent given identical seed', () => {
    const oppA = generateArchetypeOpponent(baseFlame, 'symmetry_monolith', 999)
    const oppB = generateArchetypeOpponent(baseFlame, 'symmetry_monolith', 999)
    expect(oppA.powerLevel).toBe(oppB.powerLevel)
    expect(oppA.metrics).toEqual(oppB.metrics)
  })
})
