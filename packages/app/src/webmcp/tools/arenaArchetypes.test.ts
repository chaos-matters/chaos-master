import { describe, expect, it } from 'vitest'
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
