import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import golden from './__fixtures__/breedFlame.golden.json'
import { breedFlames, CROSSOVER_MODES } from './breedFlame'
import { example1 } from './examples/example1'
import { example3 } from './examples/example3'
import { example34 } from './examples/example34'
import { example40 } from './examples/example40'
import { createSeededRandomSource, withRandomSource } from './randomize'
import type { CrossoverMode } from './breedFlame'
import type { FlameDescriptor } from './schema/flameSchema'

/**
 * A golden record of what breeding draws and what it produces.
 *
 * Breeding is pure but not obviously so: every crossover strategy pulls from
 * the ambient random source, and the ORDER of those pulls is load-bearing.
 * Reorder two draws inside `uniformCrossover` and every child downstream
 * changes, while every other breeding test still passes — they assert shape,
 * counts and validity, never values. That is the hole this file closes, so a
 * refactor of the crossover and mutation operators has something to prove
 * itself against.
 *
 * Two things are recorded per case:
 *
 *  - the draw sequence, as a length, a digest and every 128th value. Storing
 *    all ~1300 floats per case would be six figures of JSON for a diagnostic;
 *    the digest catches any reordering and the checkpoints say which 128-draw
 *    window it started in.
 *  - `children`, the canonicalized descriptors. This is the result, and it
 *    catches a change that consumes the same draws to different effect.
 *
 * Ids come from `crypto.randomUUID()` and are deliberately NOT seeded, so
 * `canonicalize` drops them and keeps position instead.
 *
 * Regenerate deliberately, never to make a red test green:
 *
 *   UPDATE_BREEDING_GOLDEN=1 npx vitest run --root packages/app \
 *     src/flame/breedFlame.golden.test.ts
 *
 * and read the diff. A changed digest means the draw order moved; if that was
 * not the point of your change, it is a bug.
 */

/**
 * One 2D pair and one 3D pair: the 3D path has its own affine components and
 * its own variation registry, and crossover walks them separately.
 *
 * Both pairs must share a dimension. `breedFlames` refuses a mismatched pair
 * and returns an empty array, which would record a case that proves nothing.
 */
const PAIRS: [string, FlameDescriptor, FlameDescriptor][] = [
  ['example1 x example3 (2D)', example1, example3],
  ['example34 x example40 (3D)', example34, example40],
]

const SEED = 0x5eed_1234
const COUNT = 2
const MUTATION_STRENGTH = 0.1
const CHECKPOINT_STRIDE = 128

type CanonicalVariation = {
  type: string
  weight: number
  params?: Record<string, number>
}

type CanonicalTransform = {
  probability: number
  colorSpeed?: number
  visible?: boolean
  preAffine?: Record<string, number>
  postAffine?: Record<string, number>
  color?: { x: number; y: number }
  variations: CanonicalVariation[]
}

type CanonicalFlame = {
  version: string
  transforms: CanonicalTransform[]
  finalTransform?: CanonicalTransform
}

type DrawRecord = {
  length: number
  digest: string
  checkpoints: number[]
}

type GoldenCase = {
  pair: string
  mode: CrossoverMode
  draws: DrawRecord
  children: CanonicalFlame[]
}

/**
 * Strip the unseeded ids, keep everything breeding actually computes.
 *
 * Insertion order is the canonical order: `Object.values` preserves it for
 * string keys, and crossover builds its records in selection order, so the
 * array index IS the slot a strategy chose to put that transform in.
 */
function canonicalTransform(transform: unknown): CanonicalTransform {
  const t = transform as Record<string, unknown>
  const variations = Object.values(
    (t.variations ?? {}) as Record<string, CanonicalVariation>,
  ).map((v) => ({
    type: v.type,
    weight: v.weight,
    ...(v.params === undefined ? {} : { params: v.params }),
  }))
  return {
    probability: t.probability as number,
    ...(t.colorSpeed === undefined
      ? {}
      : { colorSpeed: t.colorSpeed as number }),
    ...(t.visible === undefined ? {} : { visible: t.visible as boolean }),
    ...(t.preAffine === undefined
      ? {}
      : { preAffine: t.preAffine as Record<string, number> }),
    ...(t.postAffine === undefined
      ? {}
      : { postAffine: t.postAffine as Record<string, number> }),
    ...(t.color === undefined
      ? {}
      : { color: t.color as { x: number; y: number } }),
    variations,
  }
}

function canonicalize(flame: FlameDescriptor): CanonicalFlame {
  const f = flame as unknown as Record<string, unknown>
  const transforms = Object.values(
    (f.transforms ?? {}) as Record<string, unknown>,
  ).map(canonicalTransform)
  const final = f.finalTransform
  return {
    version: f.version as string,
    transforms,
    ...(final === null || final === undefined
      ? {}
      : { finalTransform: canonicalTransform(final) }),
  }
}

/**
 * FNV-1a over the raw float64 words, so two draws that differ only in the last
 * mantissa bit still produce different digests. A float-to-string digest would
 * not; breeding perturbs by fractions of a coefficient and those bits matter.
 */
function digestDraws(draws: number[]): string {
  const view = new ArrayBuffer(8)
  const asFloat = new Float64Array(view)
  const asWords = new Uint32Array(view)
  let hash = 0x811c_9dc5
  for (const draw of draws) {
    asFloat[0] = draw
    hash = Math.imul(hash ^ asWords[0]!, 0x0100_0193) >>> 0
    hash = Math.imul(hash ^ asWords[1]!, 0x0100_0193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function drawRecord(draws: number[]): DrawRecord {
  const checkpoints: number[] = []
  for (let i = 0; i < draws.length; i += CHECKPOINT_STRIDE) {
    checkpoints.push(draws[i]!)
  }
  return { length: draws.length, digest: digestDraws(draws), checkpoints }
}

/** A seeded source that keeps every value it handed out. */
function recordingSource(seed: number) {
  const base = createSeededRandomSource(seed)
  const draws: number[] = []
  return {
    draws,
    source: () => {
      const value = base()
      draws.push(value)
      return value
    },
  }
}

function runCase(
  pair: string,
  parentA: FlameDescriptor,
  parentB: FlameDescriptor,
  mode: CrossoverMode,
): GoldenCase {
  const { source, draws } = recordingSource(SEED)
  const children = withRandomSource(source, () =>
    breedFlames(parentA, parentB, {
      count: COUNT,
      crossoverMode: mode,
      mutationStrength: MUTATION_STRENGTH,
    }),
  )
  return {
    pair,
    mode,
    draws: drawRecord(draws),
    children: children.map(canonicalize),
  }
}

const cases: GoldenCase[] = PAIRS.flatMap(([pair, a, b]) =>
  CROSSOVER_MODES.map((mode) => runCase(pair, a, b, mode)),
)

const UPDATING = process.env.UPDATE_BREEDING_GOLDEN === '1'

if (UPDATING) {
  const path = join(
    dirname(fileURLToPath(import.meta.url)),
    '__fixtures__',
    'breedFlame.golden.json',
  )
  const payload = {
    seed: SEED,
    count: COUNT,
    mutationStrength: MUTATION_STRENGTH,
    checkpointStride: CHECKPOINT_STRIDE,
    cases,
  }
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`)
}

const recorded = golden as unknown as {
  seed: number
  count: number
  mutationStrength: number
  checkpointStride: number
  cases: GoldenCase[]
}

// On an update run the golden was imported BEFORE it was rewritten, so these
// comparisons would judge the new code against the record it just replaced.
describe.skipIf(UPDATING)(
  'breeding is deterministic under a seeded source',
  () => {
    it('was recorded with the knobs this file still uses', () => {
      expect(recorded.seed).toBe(SEED)
      expect(recorded.count).toBe(COUNT)
      expect(recorded.mutationStrength).toBe(MUTATION_STRENGTH)
      expect(recorded.checkpointStride).toBe(CHECKPOINT_STRIDE)
      expect(recorded.cases).toHaveLength(PAIRS.length * CROSSOVER_MODES.length)
    })

    it('distinguishes all five crossover modes on the 2D pair', () => {
      // Coverage claim, made checkable. On the 3D pair some modes coincide:
      // `weightedCrossover` and `alternateCrossover` draw nothing at all during
      // selection, so with equal-sized parents they can land on the same
      // transforms and then consume the same mutation draws. That is a property
      // of those two strategies, not a broken fixture -- but it means the 3D
      // cases alone would not notice a refactor that merged two modes. The 2D
      // pair has to, so assert it does.
      const fingerprints = recorded.cases
        .filter((c) => c.pair === PAIRS[0]![0])
        .map((c) => JSON.stringify(c.children))
      expect(new Set(fingerprints).size).toBe(CROSSOVER_MODES.length)
    })

    it('bred something in every recorded case', () => {
      // A pair that cannot breed returns [], which would record a case that
      // passes forever while testing nothing.
      expect(
        recorded.cases.map((c) => `${c.pair} ${c.mode}: ${c.children.length}`),
      ).toEqual(recorded.cases.map((c) => `${c.pair} ${c.mode}: ${COUNT}`))
    })

    for (const [index, expected] of recorded.cases.entries()) {
      const actual = cases[index]!

      describe(`${expected.pair}, ${expected.mode} crossover`, () => {
        it('covers the case the golden recorded', () => {
          expect(`${actual.pair} ${actual.mode}`).toBe(
            `${expected.pair} ${expected.mode}`,
          )
        })

        it('draws the same values in the same order', () => {
          // Length first, then position, then the digest: a changed draw COUNT
          // is a different bug from a changed draw ORDER, and the checkpoint
          // index says which window to go and read.
          expect(actual.draws.length).toBe(expected.draws.length)
          const firstBadCheckpoint = expected.draws.checkpoints.findIndex(
            (value, i) => actual.draws.checkpoints[i] !== value,
          )
          expect({
            firstDivergentDrawAtOrBefore:
              firstBadCheckpoint === -1
                ? null
                : firstBadCheckpoint * CHECKPOINT_STRIDE,
          }).toEqual({ firstDivergentDrawAtOrBefore: null })
          expect(actual.draws.digest).toBe(expected.draws.digest)
        })

        it('produces the same children', () => {
          expect(actual.children).toEqual(expected.children)
        })
      })
    }
  },
)
