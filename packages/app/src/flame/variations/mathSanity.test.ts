import { vec2f } from 'typegpu/data'
import { describe, expect, it } from 'vitest'
import { transformVariations, variationTypes } from './index'

/**
 * Finite-output sanity sweep across every registered 2D variation.
 *
 * Variation `fn`s are `'use gpu'` bodies but most also execute directly as JS,
 * so we can call each with sample points and assert the output has no
 * NaN/Infinity components. This is the first test that exercises the variation
 * math itself (previously only metadata/docs/registration were covered), and
 * it guards against a whole class of regressions — an unguarded `sqrt`/`log`/
 * division silently producing NaN pixels (exactly the ediscVar bug fixed in
 * the audit pass).
 *
 * Sample points are interior/typical coordinates, deliberately avoiding exact
 * singularities (e.g. the origin for 1/r variations) — the goal is to catch
 * accidental NaN at ordinary inputs, not to assert variations have no poles.
 *
 * Some variations use GPU-only constructs (`random()`, etc.) that TypeGPU
 * cannot execute on the JS path; those throw a specific "Execution of the
 * following tree failed" error and are skipped. Any *other* throw (e.g. a real
 * TypeError) fails the test. 3D variations are not covered here.
 */

const SAMPLE_POINTS: readonly [number, number][] = [
  [0.3, 0.4],
  [-0.5, 0.2],
  [0.1, -0.7],
  [0.6, 0.6],
  [-0.3, -0.35],
  [0.05, 0.08],
  [-0.02, 0.9],
  [0.85, -0.85],
  [1.5, 0.7],
  [-1.2, -0.4],
]

// TypeGPU's marker for a `'use gpu'` body that can't run on the JS path.
const GPU_ONLY_EXEC_ERROR = 'Execution of the following tree failed'

// Well below the ~279 currently evaluable — a floor so the sweep can't quietly
// turn into a no-op if the registry or CPU-eval path regresses.
const MIN_COVERED = 200

const varInfo = {
  weight: 1,
  affineCoefs: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

describe('variation math sanity (2D)', () => {
  it('every CPU-evaluable variation returns finite output at sample points', () => {
    let covered = 0

    for (const type of variationTypes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const def = (transformVariations as any)[type]
      if (!def?.fn) continue
      const params = def.paramDefaults

      let gpuOnly = false
      for (const [x, y] of SAMPLE_POINTS) {
        let out: { x: number; y: number }
        try {
          out = params
            ? def.fn(vec2f(x, y), varInfo, params)
            : def.fn(vec2f(x, y), varInfo)
        } catch (err) {
          if (String(err).includes(GPU_ONLY_EXEC_ERROR)) {
            gpuOnly = true
            break // not CPU-evaluable; skip this variation entirely
          }
          throw new Error(`${type} threw at (${x}, ${y}): ${String(err)}`)
        }
        expect(
          Number.isFinite(out.x) && Number.isFinite(out.y),
          `${type} produced non-finite output at (${x}, ${y}): (${out.x}, ${out.y})`,
        ).toBe(true)
      }

      if (!gpuOnly) covered++
    }

    expect(covered).toBeGreaterThanOrEqual(MIN_COVERED)
  })
})
