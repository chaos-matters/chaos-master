import { generateSeededRandomFlame, mutateFlameSeeded, MUTATION_PRESETS, } from '@/flame/randomize'
import { deepClone } from '@/utils/clone'
import { registerCommand } from '../registry'
import type { GenerateRandomFlameConfig, MutateFlameOptions, } from '@/flame/randomize'

/**
 * Deterministic primitives behind Generate/Mutate. normalizeArgs pins a
 * concrete seed AND the full config into the args, so a recorded action
 * carries everything replay needs — the log stays reproducible even if these
 * defaults change later. The workspace's Generate/Mutate handlers add
 * UI-owned behavior on top (randomizer thumbnail history, per-field render-
 * settings randomization, the sidebar's variation-category selection); they
 * route through these commands as part of M3's coverage work.
 */

/** One draw of ambient randomness, pinned into the recorded args. */
function mintSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000)
}

/** The randomizer card's baseline generation shape. An empty
 *  `allowedVariations` means the full variation pool. */
function generateDefaults(dimensions: number): GenerateRandomFlameConfig {
  return {
    strength: 0.5,
    minTransforms: 2,
    maxTransforms: 4,
    minVariations: 1,
    maxVariations: 2,
    allowedVariations: [],
    dimensions,
  }
}

const MUTATE_DEFAULTS: MutateFlameOptions = {
  mutateAffine: true,
  affineMode: 'smart',
  mutateVariations: 'modify',
  mutateColors: true,
  ...MUTATION_PRESETS.Moderate,
}

registerCommand({
  id: 'flame.randomize',
  label: 'Randomize Flame',
  description:
    'Replace the flame with a generated one — deterministic per seed',
  normalizeArgs(ctx, [seed, config]) {
    const dims = ctx.flameDescriptor().renderSettings.dimensions ?? 2
    return [
      typeof seed === 'number' ? seed : mintSeed(),
      config ?? generateDefaults(dims),
    ]
  },
  execute(ctx, seed?: unknown, config?: unknown) {
    const s = typeof seed === 'number' ? seed : mintSeed()
    const dims = ctx.flameDescriptor().renderSettings.dimensions ?? 2
    const cfg = (config ?? generateDefaults(dims)) as GenerateRandomFlameConfig
    // Built OUTSIDE the setter: the setter must stay pure (it runs once
    // under produceWithPatches, but purity is the contract).
    const generated = generateSeededRandomFlame(cfg, s)
    ctx.setFlameDescriptor(() => generated, 'Randomize Flame')
  },
})

registerCommand({
  id: 'flame.mutate',
  label: 'Mutate Flame',
  description:
    'Mutate the current flame — deterministic per seed and input flame',
  normalizeArgs(ctx, [seed, config, options]) {
    const dims = ctx.flameDescriptor().renderSettings.dimensions ?? 2
    return [
      typeof seed === 'number' ? seed : mintSeed(),
      config ?? generateDefaults(dims),
      options ?? MUTATE_DEFAULTS,
    ]
  },
  execute(ctx, seed?: unknown, config?: unknown, options?: unknown) {
    const s = typeof seed === 'number' ? seed : mintSeed()
    const dims = ctx.flameDescriptor().renderSettings.dimensions ?? 2
    const cfg = (config ?? generateDefaults(dims)) as GenerateRandomFlameConfig
    const opts = (options ?? MUTATE_DEFAULTS) as MutateFlameOptions
    const mutated = mutateFlameSeeded(
      deepClone(ctx.flameDescriptor()),
      cfg,
      opts,
      s,
    )
    ctx.setFlameDescriptor(() => mutated, 'Mutate Flame')
  },
})
