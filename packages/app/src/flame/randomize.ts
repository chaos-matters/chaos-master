/**
 * Random flame generation and mutation: `generateRandomFlame`, `mutateFlame`
 * and their seeded wrappers, which the benchmarks and the session recorder's
 * replay use to reproduce a result from a seed. The layers beneath live in
 * their own modules and are re-exported here, so this stays the one entry
 * point: the ambient source (randomSource.ts), the primitives
 * (randomPrimitives.ts), the per-transform operators (mutationOperators.ts)
 * and the rates and option types (mutationRates.ts).
 */

import { deepClone } from '@/utils/clone'
import { recordEntries } from '@/utils/record'
import { applyStructuralRemoval, countStructuralAdditions, createRandomMutatedTransform, isSymmetryCopyId, mutateTransformAffine, mutateTransformColor, mutateTransformVariations, normalizeTransformProbabilities, resolveEffectiveMutationRates, } from './mutationOperators'
import { buildRandomVariation, normalizeVariationWeights, pickRandomVariationType, randomizeAffineCoef, randomizeAllColors, } from './randomPrimitives'
import { createSeededRandomSource, randomRange, withRandomSource, } from './randomSource'
import { validateFlame } from './schema/flameSchema'
import { reweighSymmetryCopies } from './symmetry'
import { generateTransformId, generateVariationId } from './transformFunction'
import { variationTypes } from './variations'
import { variationTypes3D } from './variations3D'
import type { GenerateRandomFlameConfig, MutateFlameOptions, } from './mutationRates'
import type { FlameDescriptor } from './schema/flameSchema'
import type { TransformVariationType } from './variations'
import type { TransformVariationType3D } from './variations3D'

export { MUTATION_PRESETS, MUTATION_RATE_DEFAULTS } from './mutationRates'
export type {
  GenerateRandomFlameConfig,
  MutateFlameOptions,
  MutationPresetName,
} from './mutationRates'
export {
  buildRandomVariation,
  normalizeVariationWeights,
  perturbVariationInPlace,
  pickRandomVariationType,
  randomizeAffineCoef,
  randomizeAllColors,
  randomizeVariationParams,
  randomizeVariationType,
  smartMutateAffine2D,
  smartMutateAffine3D,
} from './randomPrimitives'
export type { RandomVariationLike } from './randomPrimitives'
export {
  createSeededRandomSource,
  random01,
  randomPerturbation,
  randomRange,
  withRandomSource,
} from './randomSource'
export type { RandomSource } from './randomSource'

/**
 * Build a randomized identity affine for a new transform: identity coefficients
 * (2D: a,e = 1; 3D: a,f,k = 1) each perturbed by {@link randomizeAffineCoef}.
 * Pre- and post-affine share this same starting point.
 */
function makeRandomizedIdentityAffine(
  dims: number,
  strength: number,
): Record<string, number> {
  const is3D = dims === 3
  if (is3D) {
    return {
      a: randomizeAffineCoef(1, 'a', strength, true),
      b: randomizeAffineCoef(0, 'b', strength, true),
      c: randomizeAffineCoef(0, 'c', strength, true),
      d: randomizeAffineCoef(0, 'd', strength, true),
      e: randomizeAffineCoef(0, 'e', strength, true),
      f: randomizeAffineCoef(1, 'f', strength, true),
      g: randomizeAffineCoef(0, 'g', strength, true),
      h: randomizeAffineCoef(0, 'h', strength, true),
      i: randomizeAffineCoef(0, 'i', strength, true),
      j: randomizeAffineCoef(0, 'j', strength, true),
      k: randomizeAffineCoef(1, 'k', strength, true),
      l: randomizeAffineCoef(0, 'l', strength, true),
    }
  }
  return {
    a: randomizeAffineCoef(1, 'a', strength, false),
    b: randomizeAffineCoef(0, 'b', strength, false),
    c: randomizeAffineCoef(0, 'c', strength, false),
    d: randomizeAffineCoef(0, 'd', strength, false),
    e: randomizeAffineCoef(1, 'e', strength, false),
    f: randomizeAffineCoef(0, 'f', strength, false),
  }
}

/**
 * Point initializer ranges / defaults for 3D/2D.
 */
export function generateRandomFlame(
  config: GenerateRandomFlameConfig,
): FlameDescriptor {
  const {
    strength,
    minTransforms,
    maxTransforms,
    minVariations,
    maxVariations,
    allowedVariations,
  } = config

  const dims = config.dimensions ?? 2

  const pool =
    allowedVariations.length > 0
      ? allowedVariations
      : dims === 3
        ? [...variationTypes3D]
        : [...variationTypes]

  const transformCount = Math.floor(
    randomRange(minTransforms, maxTransforms + 1),
  )

  const transforms: Record<string, unknown> = {}

  for (let t = 0; t < transformCount; t++) {
    const tid = generateTransformId(`logo_${t}`)

    const varCount = Math.floor(randomRange(minVariations, maxVariations + 1))
    const usedTypes = new Set<
      TransformVariationType | TransformVariationType3D
    >()
    const variations: Record<string, unknown> = {}

    for (let v = 0; v < varCount; v++) {
      const available = pool.filter((vt) => !usedTypes.has(vt))
      if (available.length === 0) break
      const vtype = pickRandomVariationType(available)
      usedTypes.add(vtype)

      const vid = generateVariationId()
      variations[vid] = buildRandomVariation(vtype, strength)
    }

    // Normalize variation weights to sum to 1
    normalizeVariationWeights(variations as Record<string, { weight: number }>)

    transforms[tid] = {
      probability: 1 / transformCount,
      preAffine: makeRandomizedIdentityAffine(dims, strength),
      postAffine: makeRandomizedIdentityAffine(dims, strength),
      color: { x: randomRange(-0.4, 0.4), y: randomRange(-0.4, 0.4) },
      variations,
      visible: true,
    }
  }

  const coloredTransforms = randomizeAllColors(transforms, strength)

  return validateFlame({
    version: '1.0',
    metadata: { name: '', description: '', author: 'unknown' },
    renderSettings: {
      exposure: 0.3,
      skipIters: 15,
      drawMode: 'light',
      backgroundColor: [0, 0, 0],
      camera: { zoom: 1, position: [0, 0], rotation: 0 },
      colorInitMode: 'colorInitPosition',
      pointInitMode: 'pointInitUnitDisk',
      vibrancy: 0.5,
      contrast: 1,
      gamma: 2.2,
      highlightPower: 0.5,
      palettePhase: 0,
      paletteSpeed: 0.5,
      densityEstimationQuality: 0.8,
      estimatorCurve: 0.5,
      paletteMode: 0,
      dimensions: dims,
      depthColorPower: 0.0,
      lightDirection: [-0.5, 0.5, -1.0],
      lightPower: 0.0,
      camera3D: {
        theta: 0,
        phi: Math.PI / 2,
        radius: 5,
        target: [0, 0, 0],
        fov: 60,
      },
    },
    transforms: coloredTransforms,
  })
}

/**
 * Deterministic benchmark-friendly random flame.
 *
 * The regular randomizer deliberately uses fresh UUIDs and ambient randomness.
 * Benchmarks need a stable descriptor, so this runs the same generator under a
 * seeded source and canonicalizes transform/variation ids afterward.
 */
export function generateSeededRandomFlame(
  config: GenerateRandomFlameConfig,
  seed: number,
): FlameDescriptor {
  const generated = withRandomSource(createSeededRandomSource(seed), () =>
    generateRandomFlame(config),
  )
  const transforms = Object.fromEntries(
    Object.values(generated.transforms).map((transform, transformIndex) => [
      `_benchmark_${seed >>> 0}_${transformIndex}`,
      {
        ...transform,
        variations: Object.fromEntries(
          Object.values(transform.variations).map(
            (variation, variationIndex) => [
              `benchmark_${transformIndex}_${variationIndex}`,
              variation,
            ],
          ),
        ),
      },
    ]),
  )

  return {
    ...generated,
    metadata: {
      ...generated.metadata,
      name: `Surprise ${seed >>> 0}`,
      description: `Deterministic benchmark flame generated from seed ${seed >>> 0}.`,
    },
    transforms,
  }
}

/**
 * Transforms as the transform list shows them. Symmetry copies (`_sym__` ids)
 * are generated from the user's transforms, so a transform-count range does
 * not count them.
 */
export function userTransformCount(
  transforms: FlameDescriptor['transforms'],
): number {
  return Object.keys(transforms).filter((tid) => !isSymmetryCopyId(tid)).length
}

export function mutateFlame(
  flame: FlameDescriptor,
  config: GenerateRandomFlameConfig,
  options: MutateFlameOptions,
): FlameDescriptor {
  const { strength, minVariations, maxVariations } = config
  const dims = config.dimensions ?? 2

  const rates = resolveEffectiveMutationRates(config, options)
  const mutated = deepClone(flame)
  const transforms = mutated.transforms

  const allEntries = recordEntries(transforms)
  const targetIds = options.selectedTransformIds

  // --- Structural mutation: remove transforms ---
  // Removed from the flame, not only from the transforms this pass varies.
  // What points at a removed transform is left as it is, as Delete Transform
  // leaves it: timeline tracks on its paths go inert while it is gone, and
  // Undo (one Mutate is one history entry) brings them back into effect.
  const entriesAfterRemoval = applyStructuralRemoval(
    allEntries,
    targetIds,
    rates.removeChance,
    config.minTransforms,
  )
  const survivors = new Set(entriesAfterRemoval.map(([tid]) => tid))
  for (const [tid] of allEntries) {
    if (!survivors.has(tid)) delete (transforms as Record<string, unknown>)[tid]
  }

  // The transforms this pass varies: the user's, never a symmetry copy, even
  // when a selection names one. A copy is the symmetry writer's rotation or
  // mirror of the user's transforms; varying its affine, colour or
  // variations broke the flame's symmetry. Its weight is set below.
  const userEntries = entriesAfterRemoval.filter(
    ([tid]) => !isSymmetryCopyId(tid),
  )
  const targetEntries =
    targetIds && targetIds.length > 0
      ? userEntries.filter(([tid]) => targetIds.includes(tid))
      : userEntries

  // --- Structural mutation: add transforms ---
  // Kept inside the config's transform range: a flame below `minTransforms`
  // is topped up to it, and chance additions stop at `maxTransforms`. A flame
  // already above the range is not pruned down to it; only the remove chance
  // removes transforms. The draw happens either way, so a flame the
  // range does not touch mutates exactly as it did before. Symmetry copies
  // are not counted: the range is about the transforms the user sees. The
  // count is taken after the removals, so a removal makes room for an add.
  const drawnAdditions = countStructuralAdditions(rates.addChance)
  const existingCount = userTransformCount(transforms)
  const addedCount = Math.max(
    config.minTransforms - existingCount,
    Math.min(drawnAdditions, Math.max(0, config.maxTransforms - existingCount)),
  )

  for (const [, t] of targetEntries) {
    if (options.mutateAffine) {
      mutateTransformAffine(t, dims, rates.affineStrength, options.affineMode)
    }
    if (options.mutateColors) {
      mutateTransformColor(t, strength, rates.colorRate)
    }
    mutateTransformVariations(t, options.mutateVariations, {
      strength,
      weightRate: rates.weightRate,
      swapChance: rates.swapChance,
      pool: rates.pool,
      minVariations,
      maxVariations,
    })
  }

  // --- Structural mutation: insert newly created transforms ---
  for (let i = 0; i < addedCount; i++) {
    const nt = createRandomMutatedTransform(
      minVariations,
      maxVariations,
      rates.pool,
      dims,
      strength,
    )
    const newTid = generateTransformId()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mutated.transforms as Record<string, any>)[newTid] = nt
  }

  // Normalize transform probabilities after structural changes: the user's
  // transforms are evened out, and the symmetry copies then get the weight
  // the symmetry writer gives them, so a Mutate keeps the flame's symmetry.
  normalizeTransformProbabilities(mutated.transforms)
  reweighSymmetryCopies(mutated.transforms)

  return mutated
}

/**
 * Deterministic mutation: {@link mutateFlame} under a seeded source, with the
 * ids it mints made reproducible. Mutation preserves every surviving id and
 * generates fresh UUIDs only for ADDED transforms (`addTransformChance`) and
 * ADDED variations (the 'all' mode top-up) — exactly those are renamed from
 * the seed, so one (input, config, options, seed) tuple yields one descriptor:
 * the session recorder's replay contract. Surviving ids must never be touched
 * here; timeline tracks and selections reference them.
 */
export function mutateFlameSeeded(
  flame: FlameDescriptor,
  config: GenerateRandomFlameConfig,
  options: MutateFlameOptions,
  seed: number,
): FlameDescriptor {
  const mutated = withRandomSource(createSeededRandomSource(seed), () =>
    mutateFlame(flame, config, options),
  )
  const seedTag = seed >>> 0
  const inputVariationIds = new Map(
    Object.entries(flame.transforms).map(([tid, transform]) => [
      tid,
      new Set(Object.keys(transform.variations)),
    ]),
  )

  /**
   * A stable name for a minted id, skipped past anything already in use.
   *
   * The skip matters because these names are derived from the seed alone, and
   * a script may reuse one seed across several mutates: the second run would
   * otherwise mint the exact name a survivor of the first run already holds,
   * and `Object.fromEntries` would silently drop the survivor. `taken` is
   * seeded with every id in the mutated flame, so a minted name can collide
   * neither with a survivor nor with an earlier mint in this same pass.
   */
  const nextFreeId = (
    prefix: string,
    counter: { n: number },
    taken: Set<string>,
  ): string => {
    let candidate = `${prefix}${counter.n++}`
    while (taken.has(candidate)) {
      candidate = `${prefix}${counter.n++}`
    }
    taken.add(candidate)
    return candidate
  }

  const takenTransformIds = new Set(Object.keys(mutated.transforms))
  const transformCounter = { n: 0 }
  const transforms = Object.fromEntries(
    Object.entries(mutated.transforms).map(
      ([tid, transform], transformIndex) => {
        const knownVids = inputVariationIds.get(tid)
        const takenVariationIds = new Set(Object.keys(transform.variations))
        const variationCounter = { n: 0 }
        const variations = Object.fromEntries(
          Object.entries(transform.variations).map(([vid, variation]) => [
            knownVids?.has(vid) === true
              ? vid
              : nextFreeId(
                  `mut_${seedTag}_${transformIndex}_`,
                  variationCounter,
                  takenVariationIds,
                ),
            variation,
          ]),
        )
        return [
          knownVids === undefined
            ? nextFreeId(
                `_mut_${seedTag}_`,
                transformCounter,
                takenTransformIds,
              )
            : tid,
          { ...transform, variations },
        ]
      },
    ),
  )
  return { ...mutated, transforms }
}
