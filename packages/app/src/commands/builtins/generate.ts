import { generateSeededRandomFlame, mutateFlameSeeded, MUTATION_PRESETS, } from '@/flame/randomize'
import { isFlameGraphWithinLimits, isSafeFlameEntityId, MAX_FLAME_TRANSFORMS, tryValidateFlame, } from '@/flame/schema/flameSchema'
import { isVariationTypeFor } from '@/flame/variationRegistry'
import { deepClone } from '@/utils/clone'
import { registerCommand } from '../registry'
import type { CommandContext } from '../types'
import type { GenerateRandomFlameConfig, MutateFlameOptions, } from '@/flame/randomize'
import type { Dims } from '@/flame/variationRegistry'

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
 *  `allowedVariations` means the full variation pool.
 *
 *  Exported because `asGenerateConfig` accepts only a COMPLETE config — a
 *  partial `{ dimensions: 3 }` fails every one of its checks and falls back to
 *  the flame's current dimension, silently. A caller that wants to randomize
 *  at a chosen dimension has to hand over the whole shape. */
export function generateDefaults(dimensions: Dims): GenerateRandomFlameConfig {
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

export const MAX_GENERATED_TRANSFORMS = 10
export const MAX_GENERATED_VARIATIONS_PER_TRANSFORM = 10
const MAX_ALLOWED_VARIATIONS = 512
const MAX_SELECTED_TRANSFORMS = MAX_FLAME_TRANSFORMS

const GENERATE_CONFIG_KEYS = new Set([
  'strength',
  'minTransforms',
  'maxTransforms',
  'minVariations',
  'maxVariations',
  'allowedVariations',
  'dimensions',
])

const MUTATION_OPTION_KEYS = new Set([
  'mutateAffine',
  'affineMode',
  'mutateVariations',
  'mutateColors',
  'affineMutationRate',
  'variationWeightRate',
  'variationSwapChance',
  'colorMutationRate',
  'addTransformChance',
  'removeTransformChance',
  'selectedTransformIds',
])

function hasOnlyKeys(input: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(input).every((key) => allowed.has(key))
}

function asGenerateConfig(
  value: unknown,
  fallbackDimensions?: Dims,
): GenerateRandomFlameConfig | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  const input = value as Record<string, unknown>
  if (!hasOnlyKeys(input, GENERATE_CONFIG_KEYS)) return undefined
  const dimensions =
    input.dimensions === 2 || input.dimensions === 3
      ? input.dimensions
      : fallbackDimensions
  const strength = input.strength
  const minTransforms = input.minTransforms
  const maxTransforms = input.maxTransforms
  const minVariations = input.minVariations
  const maxVariations = input.maxVariations
  const allowedVariations = input.allowedVariations
  if (
    typeof strength !== 'number' ||
    dimensions === undefined ||
    !Number.isFinite(strength) ||
    strength < 0 ||
    strength > 1 ||
    !Number.isInteger(minTransforms) ||
    !Number.isInteger(maxTransforms) ||
    !Number.isInteger(minVariations) ||
    !Number.isInteger(maxVariations) ||
    (minTransforms as number) < 1 ||
    (maxTransforms as number) < (minTransforms as number) ||
    (maxTransforms as number) > MAX_GENERATED_TRANSFORMS ||
    (minVariations as number) < 1 ||
    (maxVariations as number) < (minVariations as number) ||
    (maxVariations as number) > MAX_GENERATED_VARIATIONS_PER_TRANSFORM ||
    !isFlameGraphWithinLimits(
      maxTransforms as number,
      (maxTransforms as number) * (maxVariations as number),
      maxVariations as number,
    ) ||
    !Array.isArray(allowedVariations) ||
    allowedVariations.length > MAX_ALLOWED_VARIATIONS ||
    new Set(allowedVariations).size !== allowedVariations.length ||
    !allowedVariations.every(
      (entry) =>
        typeof entry === 'string' && isVariationTypeFor(dimensions, entry),
    )
  ) {
    return undefined
  }
  return {
    strength,
    minTransforms: minTransforms as number,
    maxTransforms: maxTransforms as number,
    minVariations: minVariations as number,
    maxVariations: maxVariations as number,
    allowedVariations:
      allowedVariations as GenerateRandomFlameConfig['allowedVariations'],
    dimensions,
  }
}

function asMutationOptions(value: unknown): MutateFlameOptions | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  const input = value as Record<string, unknown>
  if (!hasOnlyKeys(input, MUTATION_OPTION_KEYS)) return undefined
  const rate = (key: string, max = 1) =>
    input[key] === undefined ||
    (typeof input[key] === 'number' &&
      Number.isFinite(input[key]) &&
      input[key] >= 0 &&
      input[key] <= max)
  const selected = input.selectedTransformIds
  if (
    typeof input.mutateAffine !== 'boolean' ||
    (input.affineMode !== 'smart' && input.affineMode !== 'full') ||
    (input.mutateVariations !== 'modify' &&
      input.mutateVariations !== 'all' &&
      input.mutateVariations !== 'none') ||
    typeof input.mutateColors !== 'boolean' ||
    !rate('affineMutationRate') ||
    !rate('variationWeightRate') ||
    !rate('variationSwapChance') ||
    !rate('colorMutationRate') ||
    !rate('addTransformChance', 0.3) ||
    !rate('removeTransformChance', 0.3) ||
    (selected !== undefined &&
      (!Array.isArray(selected) ||
        selected.length > MAX_SELECTED_TRANSFORMS ||
        new Set(selected).size !== selected.length ||
        !selected.every((entry) => isSafeFlameEntityId(entry))))
  ) {
    return undefined
  }
  return {
    mutateAffine: input.mutateAffine,
    affineMode: input.affineMode,
    mutateVariations: input.mutateVariations,
    mutateColors: input.mutateColors,
    ...(input.affineMutationRate === undefined
      ? {}
      : { affineMutationRate: input.affineMutationRate as number }),
    ...(input.variationWeightRate === undefined
      ? {}
      : { variationWeightRate: input.variationWeightRate as number }),
    ...(input.variationSwapChance === undefined
      ? {}
      : { variationSwapChance: input.variationSwapChance as number }),
    ...(input.colorMutationRate === undefined
      ? {}
      : { colorMutationRate: input.colorMutationRate as number }),
    ...(input.addTransformChance === undefined
      ? {}
      : { addTransformChance: input.addTransformChance as number }),
    ...(input.removeTransformChance === undefined
      ? {}
      : { removeTransformChance: input.removeTransformChance as number }),
    ...(selected === undefined
      ? {}
      : { selectedTransformIds: [...(selected as string[])] }),
  }
}

/**
 * Shared by `normalizeArgs` and `execute` so the two can never drift, and
 * idempotent: re-running it on already-normalized args (the registry path)
 * returns them unchanged, while a direct `execute()` call still gets sane
 * values.
 */
function resolveSeededArgs(
  ctx: CommandContext,
  seed: unknown,
  config: unknown,
): [number, GenerateRandomFlameConfig] {
  const dims = (ctx.flameDescriptor().renderSettings.dimensions ?? 2) as 2 | 3
  return [
    typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : mintSeed(),
    asGenerateConfig(config, dims) ?? generateDefaults(dims),
  ]
}

registerCommand({
  id: 'flame.randomize',
  describe: () => 'Randomize the flame',
  label: 'Randomize Flame',
  description:
    'Replace the flame with a generated one — deterministic per seed',
  validateReplayArgs(args) {
    if (args.length !== 2) return 'randomize expects a seed and config'
    const [seed, config] = args
    if (
      typeof seed !== 'number' ||
      !Number.isInteger(seed) ||
      seed < 0 ||
      seed > 0xffff_ffff
    ) {
      return 'seed must be an unsigned 32-bit integer'
    }
    return asGenerateConfig(config) ? undefined : 'invalid generator config'
  },
  normalizeArgs(ctx, [seed, config]) {
    return resolveSeededArgs(ctx, seed, config)
  },
  execute(ctx, seed?: unknown, config?: unknown) {
    const [s, cfg] = resolveSeededArgs(ctx, seed, config)
    // Built OUTSIDE the setter: the setter must stay pure (it runs once
    // under produceWithPatches, but purity is the contract).
    const generated = tryValidateFlame(generateSeededRandomFlame(cfg, s))
    if (!generated) {
      console.warn('[cmd] flame.randomize: generated flame exceeded limits')
      return
    }
    ctx.setFlameDescriptor(() => generated, 'Randomize Flame')
  },
})

registerCommand({
  id: 'flame.mutate',
  describe: () => 'Mutate the flame',
  label: 'Mutate Flame',
  description:
    'Mutate the current flame — deterministic per seed and input flame',
  validateReplayArgs(args) {
    if (args.length !== 3) {
      return 'mutate expects a seed, generator config, and mutation options'
    }
    const [seed, config, options] = args
    if (
      typeof seed !== 'number' ||
      !Number.isInteger(seed) ||
      seed < 0 ||
      seed > 0xffff_ffff
    ) {
      return 'seed must be an unsigned 32-bit integer'
    }
    if (!asGenerateConfig(config)) return 'invalid generator config'
    return asMutationOptions(options) ? undefined : 'invalid mutation options'
  },
  normalizeArgs(ctx, [seed, config, options]) {
    return [...resolveSeededArgs(ctx, seed, config), options ?? MUTATE_DEFAULTS]
  },
  execute(ctx, seed?: unknown, config?: unknown, options?: unknown) {
    const [s, cfg] = resolveSeededArgs(ctx, seed, config)
    const opts = asMutationOptions(options) ?? MUTATE_DEFAULTS
    const mutated = mutateFlameSeeded(
      deepClone(ctx.flameDescriptor()),
      cfg,
      opts,
      s,
    )
    const validated = tryValidateFlame(mutated)
    if (!validated) {
      console.warn('[cmd] flame.mutate: mutation exceeded renderer limits')
      return
    }
    ctx.setFlameDescriptor(() => validated, 'Mutate Flame')
  },
})
