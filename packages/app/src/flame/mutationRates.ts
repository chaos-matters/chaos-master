/**
 * The knobs of random generation and mutation: the config and option shapes,
 * the default mutation rates and the named presets. A leaf of the randomizer,
 * so the mutation operators, commands and UI can read it without importing
 * any of the randomizing code.
 */

import type { TransformVariationType } from './variations'
import type { TransformVariationType3D } from './variations3D'

export interface GenerateRandomFlameConfig {
  strength: number
  minTransforms: number
  maxTransforms: number
  minVariations: number
  maxVariations: number
  allowedVariations: (TransformVariationType | TransformVariationType3D)[]
  dimensions?: number
}

export interface MutateFlameOptions {
  mutateAffine: boolean
  /**
   * How affine coefficients are mutated when `mutateAffine` is on. `'smart'`
   * composes the affine with random rotate/scale/translate operations (see
   * {@link smartMutateAffine2D}); `'full'` perturbs every coefficient
   * independently (`randomizeAffineCoef`).
   */
  affineMode: 'smart' | 'full'
  /** 0–1, how strongly affine coefficients drift (default 0.5). */
  affineMutationRate?: number
  mutateVariations: 'modify' | 'all' | 'none'
  /** 0–1, magnitude of variation-weight perturbation (default 0.5). */
  variationWeightRate?: number
  /** 0–1, probability of swapping a variation type entirely (default 0.1). */
  variationSwapChance?: number
  mutateColors: boolean
  /** 0–1, how strongly OkLab color values shift (default 0.4). */
  colorMutationRate?: number
  /** 0–0.3, probability of adding a new random transform (default 0). */
  addTransformChance?: number
  /** 0–0.3, probability of removing a transform (default 0). */
  removeTransformChance?: number
  /** If provided, restrict mutation to only these transform IDs. */
  selectedTransformIds?: string[]
}

/** Sensible defaults for the new fine-grained rate fields. */
export const MUTATION_RATE_DEFAULTS = {
  affineMutationRate: 0.5,
  variationWeightRate: 0.5,
  variationSwapChance: 0.1,
  colorMutationRate: 0.4,
  addTransformChance: 0,
  removeTransformChance: 0,
} as const

/** Presets for common mutation styles. */
export const MUTATION_PRESETS = {
  Subtle: {
    affineMutationRate: 0.15,
    variationWeightRate: 0.15,
    variationSwapChance: 0.02,
    colorMutationRate: 0.1,
    addTransformChance: 0,
    removeTransformChance: 0,
  },
  Moderate: {
    affineMutationRate: 0.4,
    variationWeightRate: 0.4,
    variationSwapChance: 0.1,
    colorMutationRate: 0.3,
    addTransformChance: 0,
    removeTransformChance: 0,
  },
  Chaotic: {
    affineMutationRate: 0.8,
    variationWeightRate: 0.8,
    variationSwapChance: 0.35,
    colorMutationRate: 0.7,
    addTransformChance: 0.1,
    removeTransformChance: 0.05,
  },
  Structural: {
    affineMutationRate: 0.2,
    variationWeightRate: 0.2,
    variationSwapChance: 0,
    colorMutationRate: 0.1,
    addTransformChance: 0.25,
    removeTransformChance: 0.2,
  },
} as const

export type MutationPresetName = keyof typeof MUTATION_PRESETS
