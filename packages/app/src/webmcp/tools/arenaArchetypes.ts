import { mutateFlameSeeded } from '@/flame/randomize'
import { deepClone } from '@/utils/clone'
import { calculateFlameStats } from '@/webmcp/tools/scoreFlame'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TransformVariationType } from '@/flame/variations'
import type { TransformVariationType3D } from '@/flame/variations3D'

export type TacticalStance = 'resonance' | 'bastion' | 'entropy' | 'balanced'

export interface TacticalStanceInfo {
  id: TacticalStance
  name: string
  description: string
  tagline: string
  color: string
  effects: {
    energyMultiplier: number
    symmetryMultiplier: number
    chaosMultiplier: number
    complexityMultiplier: number
  }
}

export const TACTICAL_STANCES: Record<TacticalStance, TacticalStanceInfo> = {
  balanced: {
    id: 'balanced',
    name: 'Harmonic Stance',
    tagline: 'Standard Form',
    description: 'Balanced power allocation with stable territory defense.',
    color: '#94a3b8',
    effects: {
      energyMultiplier: 1.0,
      symmetryMultiplier: 1.0,
      chaosMultiplier: 1.0,
      complexityMultiplier: 1.0,
    },
  },
  resonance: {
    id: 'resonance',
    name: 'Resonance Surge',
    tagline: '+25% Energy',
    description: 'Overcharges energy intensity for faster territory expansion.',
    color: '#22d3ee',
    effects: {
      energyMultiplier: 1.25,
      symmetryMultiplier: 1.0,
      chaosMultiplier: 0.95,
      complexityMultiplier: 1.0,
    },
  },
  bastion: {
    id: 'bastion',
    name: 'Symmetry Bastion',
    tagline: '+30% Symmetry',
    description:
      'Constructs crystalline geometric barriers against high chaos.',
    color: '#818cf8',
    effects: {
      energyMultiplier: 0.95,
      symmetryMultiplier: 1.3,
      chaosMultiplier: 0.85,
      complexityMultiplier: 1.05,
    },
  },
  entropy: {
    id: 'entropy',
    name: 'Entropy Overload',
    tagline: '+35% Chaos',
    description:
      'Unleashes chaotic non-linear fluctuations for volatile events.',
    color: '#f43f5e',
    effects: {
      energyMultiplier: 1.1,
      symmetryMultiplier: 0.8,
      chaosMultiplier: 1.35,
      complexityMultiplier: 1.1,
    },
  },
}

export type ArchetypeId =
  | 'symmetry_monolith'
  | 'chaos_lord'
  | 'spiral_leviathan'
  | 'quantum_siren'
  | 'solar_seraph'
  | 'void_stalker'

export interface OpponentArchetype {
  id: ArchetypeId
  name: string
  className: string
  lore: string
  color: string
  paletteHue: number
  mutationStrength: number
  /**
   * Variation pool `generateArchetypeOpponent` draws from. These must be live
   * registry keys (`transformVariations` / `transformVariations3D`), i.e. the
   * `…Var` / `…3D` names — NOT the bare Apophysis names (`polar`, `cross`).
   * A bare name reaches the shader compiler unresolved, gets dropped with
   * `[createFlameWgsl] skipping unsupported variation type "…"`, and is then
   * persisted to Recents so it warns again on every reload. The type alone
   * cannot enforce this (`TransformVariationType` carries a `string & {}`
   * escape hatch), so `arenaArchetypes.test.ts` pins it against the registry.
   */
  allowedVariations: (TransformVariationType | TransformVariationType3D)[]
}

export const ARENA_ARCHETYPES: Record<ArchetypeId, OpponentArchetype> = {
  symmetry_monolith: {
    id: 'symmetry_monolith',
    name: 'Aethelgard Monolith',
    className: 'Symmetry Monolith',
    lore: 'An ancient crystalline titan forged in geometric balance and unbreakable symmetry.',
    color: '#818cf8',
    paletteHue: 0.55,
    mutationStrength: 0.35,
    allowedVariations: [
      'polarVar',
      'polar2Var',
      'juliaVar',
      'juliaNVar',
      'cylinderVar',
      'discVar',
      'squareVar',
      'crossVar',
    ],
  },
  chaos_lord: {
    id: 'chaos_lord',
    name: 'Xul the Entropic',
    className: 'Chaos Lord',
    lore: 'A master of unpredictable phase shifts and non-linear turbulent vectors.',
    color: '#f43f5e',
    paletteHue: 0.98,
    mutationStrength: 0.65,
    allowedVariations: [
      'swirlVar',
      'sphericalVar',
      'exponentialVar',
      'bubbleVar',
      'bentVar',
      'wavesVar',
      'pdjVar',
      'gaussianVar',
    ],
  },
  spiral_leviathan: {
    id: 'spiral_leviathan',
    name: 'Nautilus Prime',
    className: 'Spiral Leviathan',
    lore: 'A primordial entity winding deep infinite spirals across spatial dimensions.',
    color: '#06b6d4',
    paletteHue: 0.5,
    mutationStrength: 0.45,
    allowedVariations: [
      'spiralVar',
      'swirlVar',
      'ringsVar',
      'rings2Var',
      'eyefishVar',
      'fisheyeVar',
      'curlVar',
      'wavesVar',
    ],
  },
  quantum_siren: {
    id: 'quantum_siren',
    name: 'Vex the Multi-Phased',
    className: 'Quantum Siren',
    lore: 'A multi-transform apparition flickering through overlapping probability fields.',
    color: '#c084fc',
    paletteHue: 0.78,
    mutationStrength: 0.5,
    allowedVariations: [
      'exVar',
      'diamondVar',
      'handkerchiefVar',
      'heartVar',
      // `starfield` is 3D-only (`starfield3D`). `noiseVar` is the 2D registry's
      // stochastic scatter — the nearest kin to starfield's randomized point
      // cloud, and it reads as the Siren's flickering probability field.
      'noiseVar',
      'cylinderVar',
      'bubbleVar',
    ],
  },
  solar_seraph: {
    id: 'solar_seraph',
    name: 'Sol Invictus',
    className: 'Solar Seraph',
    lore: 'A blinding corona of high-energy radiant plasma that overwhelms rivals.',
    color: '#f59e0b',
    paletteHue: 0.12,
    mutationStrength: 0.4,
    allowedVariations: [
      'sinusoidalVar',
      'sphericalVar',
      'linearVar',
      'linearTVar',
      // `hemisphere` is 3D-only (`hemisphere3D`, `pos / sqrt(|pos|² + 1)`).
      // `bubbleVar` is the same dome projection in 2D — a bounded radiant orb,
      // which is exactly the Seraph's solar disc.
      'bubbleVar',
      'cylinderVar',
    ],
  },
  void_stalker: {
    id: 'void_stalker',
    name: 'Umbra the Devourer',
    className: 'Void Stalker',
    lore: 'A dark singularity drawing all nearby vectors into an inescapable gravitational well.',
    color: '#a855f7',
    paletteHue: 0.85,
    mutationStrength: 0.55,
    allowedVariations: [
      'sphericalVar',
      'scryVar',
      'powerVar',
      'eyefishVar',
      'fisheyeVar',
      'squareVar',
      'crossVar',
    ],
  },
}

export const ARCHETYPE_IDS: ArchetypeId[] = [
  'symmetry_monolith',
  'chaos_lord',
  'spiral_leviathan',
  'quantum_siren',
  'solar_seraph',
  'void_stalker',
]

export interface GeneratedFighter {
  archetype: OpponentArchetype
  name: string
  className: string
  powerLevel: number
  flame: FlameDescriptor
  metrics: {
    complexity: number
    chaosLevel: number
    symmetryScore: number
    energyIntensity: number
  }
}

/**
 * Generate a thematic procedural opponent flame based on an archetype recipe.
 */
export function generateArchetypeOpponent(
  baseFlame: FlameDescriptor,
  archetypeId?: ArchetypeId,
  seed: number = Math.floor(Math.random() * 100000),
): GeneratedFighter {
  const chosenId =
    archetypeId ??
    ARCHETYPE_IDS[Math.floor(Math.abs(seed) % ARCHETYPE_IDS.length)]!
  const archetype = ARENA_ARCHETYPES[chosenId]

  const current = deepClone(baseFlame)
  const dims = current.renderSettings.dimensions ?? 2

  const mutated = mutateFlameSeeded(
    current,
    {
      strength: archetype.mutationStrength,
      minTransforms: 2,
      maxTransforms: 5,
      minVariations: 1,
      maxVariations: 3,
      allowedVariations: archetype.allowedVariations,
      dimensions: dims,
    },
    {
      mutateAffine: true,
      affineMode: 'smart',
      mutateVariations: 'all',
      mutateColors: true,
    },
    seed,
  )

  // Ensure metadata and render settings match archetype theme
  mutated.metadata = {
    ...mutated.metadata,
    name: archetype.name,
  }
  mutated.renderSettings = {
    ...mutated.renderSettings,
    palettePhase: archetype.paletteHue,
  }

  const stats = calculateFlameStats(mutated)

  return {
    archetype,
    name: archetype.name,
    className: archetype.className,
    powerLevel: stats.powerLevel,
    flame: mutated,
    metrics: stats.metrics,
  }
}
