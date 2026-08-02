// Entry point for the curated-sequence generator: turns a starting flame into
// the ordered list of flames a `gallery_items.sequence` row plays through.
//
// It imports the app's OWN randomiser (src/flame/randomize.ts) rather than
// reimplementing one, so what Home shows is what the app's Randomizer card
// produces — that is the entire claim `cap-randomizer` makes. Bundled by
// esbuild and run in plain node (see gallery-sequence.mjs); no browser, no GPU.
//
// stdin: JSON options. stdout: JSON `{ sequence: FlameDescriptor[] }`.
import { validateFlame } from '@/flame/schema/flameSchema'
import { categoryOf } from '@/flame/variationRegistry'
import { variationTypes } from '@/flame/variations'
import { variationTypes3D } from '@/flame/variations3D'
import type { GenerateRandomFlameConfig, MutateFlameOptions, } from '@/flame/randomize'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TransformVariationType } from '@/flame/variations'
import type { TransformVariationType3D } from '@/flame/variations3D'

interface Options {
  /** The row's stored flame — where the walk starts and ends. */
  flame: unknown
  /** PRNG seed. The same seed always produces the same sequence. */
  seed: number
  /** Curated paths to concatenate. 2 puts two whole runs in one column. */
  paths: number
  /** Derived flames per path, after its opening roll. */
  derived: number
  /** Open each path with a freshly rolled random flame. */
  roll: boolean
  /** Randomiser strength, matching the card's own default. */
  strength: number
}

/**
 * mulberry32 — small, fast, and good enough for content generation.
 *
 * Determinism is the point: the sequence is generated ONCE and stored, so a
 * curator who dislikes a path must be able to try another seed and re-run,
 * and a reviewer must be able to reproduce what was committed. Nothing here
 * ships to the browser.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = []
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk: string) => {
      chunks.push(chunk)
    })
    process.stdin.on('end', () => {
      resolve(chunks.join(''))
    })
    process.stdin.on('error', reject)
  })
}

async function main() {
  const options = JSON.parse(await readStdin()) as Options
  const random = mulberry32(options.seed)

  // The randomiser reaches for both of these. Replaced BEFORE importing it so
  // every id and every coefficient comes from the seeded stream — an unseeded
  // `randomUUID` alone would make two runs of the same seed differ in every
  // transform id, and the stored JSON would never be reviewable as a diff.
  Math.random = random
  let uuidCounter = 0
  const randomUUID = () => {
    const hex = (n: number) =>
      Math.floor(random() * 0x10000)
        .toString(16)
        .padStart(4, '0')
        .slice(0, n)
    uuidCounter += 1
    return `${hex(4)}${hex(4)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(4)}${hex(4)}${uuidCounter.toString(16).padStart(4, '0')}`
  }
  // `window`, not `globalThis.crypto`: the app's id generators go through
  // `window.crypto.randomUUID()`, and node's own `globalThis.crypto` is a
  // getter-only property that cannot be replaced at all.
  ;(globalThis as unknown as { window: unknown }).window = {
    crypto: { randomUUID },
  }

  // Imported after the shims are in place: the module body itself is harmless,
  // but keeping the order explicit is what stops a future top-level `Math.
  // random()` in that file from escaping the seed.
  const { generateRandomFlame, mutateFlame } = await import('@/flame/randomize')

  const start = validateFlame(options.flame)
  const dimensions = start.renderSettings.dimensions === 3 ? 3 : 2

  /**
   * The Randomizer card's own defaults (FlameRandomizerCard.tsx): General +
   * Blur variations only, 2-4 transforms, 1-2 variations each. Copied by VALUE
   * rather than imported because that module is a Solid component — but they
   * are the numbers the card starts on, which is what "what the randomizer
   * produces" has to mean.
   */
  const list = dimensions === 3 ? variationTypes3D : variationTypes
  const allowedVariations = list.filter((type) => {
    const category = categoryOf(dimensions, type)
    return category === 'general' || category === 'blur'
  }) as (TransformVariationType | TransformVariationType3D)[]

  const config: GenerateRandomFlameConfig = {
    strength: options.strength,
    minTransforms: 2,
    maxTransforms: 4,
    minVariations: 1,
    maxVariations: 2,
    allowedVariations,
    dimensions,
  }

  /**
   * "Steer it", not "roll it again": the derived flames have to read as the
   * same flame being pushed around, so this is the card's Subtle/Moderate
   * territory — affines and weights move, structure does not. `addTransform`
   * and `removeTransform` stay at zero for the same reason.
   */
  const mutation: MutateFlameOptions = {
    mutateAffine: true,
    affineMode: 'smart',
    affineMutationRate: 0.35,
    mutateVariations: 'modify',
    variationWeightRate: 0.35,
    variationSwapChance: 0.06,
    mutateColors: true,
    colorMutationRate: 0.25,
    addTransformChance: 0,
    removeTransformChance: 0,
  }

  /**
   * The sequence is FLAT and ordered, and each path is simply appended. A row
   * with `paths: 2` holds two complete runs one after another, and the player
   * walks them without knowing where one ends — which is the whole reason the
   * column is a list rather than a nested structure.
   */
  const sequence: FlameDescriptor[] = []
  for (let path = 0; path < Math.max(1, options.paths); path++) {
    const opening = options.roll ? generateRandomFlame(config) : start
    if (options.roll) {
      sequence.push(opening)
    }
    let current = opening
    for (let i = 0; i < Math.max(0, options.derived); i++) {
      current = mutateFlame(current, config, mutation)
      sequence.push(current)
    }
  }

  process.stdout.write(
    JSON.stringify({
      sequence: sequence.map((flame) => validateFlame(flame)),
      dimensions,
    }),
  )
}

await main()
