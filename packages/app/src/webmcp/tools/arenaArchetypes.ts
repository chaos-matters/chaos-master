import { generateSeededRandomFlame, mutateFlameSeeded, userTransformCount, } from '@/flame/randomize'
import { calculateGroundedStats } from '@/flame/stats'
import { deepClone } from '@/utils/clone'
import { calculateFlameStats } from '@/webmcp/tools/scoreFlame'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { FlameSchool, GroundedFlameStats } from '@/flame/stats'
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

/**
 * Calculate stance-adjusted effective power level.
 * Falls back to balanced stance if an unknown or undefined stance is provided.
 */
export function calculateEffectivePower(
  basePower: number,
  stance?: string | null,
): number {
  const stanceInfo =
    (stance && TACTICAL_STANCES[stance as TacticalStance]) ||
    TACTICAL_STANCES.balanced
  const multiplier =
    (stanceInfo.effects.energyMultiplier +
      stanceInfo.effects.symmetryMultiplier +
      stanceInfo.effects.chaosMultiplier) /
    3
  return Math.round((basePower || 0) * multiplier)
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
   *
   * The 2D pool. A 3D opponent draws from `allowedVariations3D` instead: the
   * 3D renderer runs a 2D type as a flat map with z passed through, and the
   * opponents it produced rendered nearly black.
   */
  allowedVariations: TransformVariationType[]
  /** The same recipe in the 3D registry, for opponents of a 3D flame. */
  allowedVariations3D: TransformVariationType3D[]
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
    allowedVariations3D: [
      'polar3D',
      'julia3D',
      'cylinder3D',
      'disc3D',
      'square3D',
      'cross3D',
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
    allowedVariations3D: [
      'swirl3D',
      'spherical3D',
      'exponential3D',
      'bubble3D',
      'bent3D',
      'waves3D',
      'pdj3D',
      'gaussian3D',
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
    allowedVariations3D: [
      'spiral3D',
      'swirl3D',
      'rings3D',
      'eyefish3D',
      'fisheye3D',
      'curl3D',
      'waves3D',
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
    allowedVariations3D: [
      'ex3D',
      'diamond3D',
      'handkerchief3D',
      'heart3D',
      'starfield3D',
      'cylinder3D',
      'bubble3D',
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
    allowedVariations3D: [
      'sinusoidal3D',
      'spherical3D',
      'linear3D',
      'hemisphere3D',
      'cylinder3D',
      'bubble3D',
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
    allowedVariations3D: [
      'spherical3D',
      'scry3D',
      'power3D',
      'eyefish3D',
      'fisheye3D',
      'square3D',
      'cross3D',
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
  school: FlameSchool
  powerLevel: number
  flame: FlameDescriptor
  groundedStats: GroundedFlameStats
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
  const config = {
    strength: archetype.mutationStrength,
    minTransforms: 2,
    maxTransforms: 5,
    minVariations: 1,
    maxVariations: 3,
    allowedVariations:
      dims === 3 ? archetype.allowedVariations3D : archetype.allowedVariations,
    dimensions: dims,
  }

  // A base below two transforms (a fresh project, 2D or 3D) has too little
  // structure to mutate into a rival: its opponents rendered nearly black. So
  // it is rolled fresh from the archetype's recipe instead, and keeps only the
  // base's render settings, camera and exposure included. Symmetry copies
  // do not count, and the roll does not keep them: they mirror the base's
  // transforms, which the roll replaces.
  const mutated =
    userTransformCount(current.transforms) < 2
      ? {
          ...current,
          transforms: generateSeededRandomFlame(config, seed).transforms,
        }
      : mutateFlameSeeded(
          current,
          config,
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
  const grounded = calculateGroundedStats(mutated)

  return {
    archetype,
    name: archetype.name,
    className: archetype.className,
    school: grounded.school,
    powerLevel: grounded.powerLevel,
    flame: mutated,
    groundedStats: grounded,
    metrics: stats.metrics,
  }
}
