/**
 * Pins the rule the randomize split rests on: there is exactly one ambient
 * random source, and every layer draws from it. `withRandomSource` swaps that
 * source; a helper bound to any other one still returns plausible numbers, so
 * shape tests pass while seeded generate, mutate and breed silently stop
 * reproducing. Each case below counts the draws one layer takes from an
 * installed source, which drops to zero the moment that layer draws elsewhere.
 */
import { describe, expect, it } from 'vitest'
import { countStructuralAdditions } from './mutationOperators'
import * as randomize from './randomize'
import { randomizeAffineCoef, smartMutateAffine2D } from './randomPrimitives'
import * as randomSource from './randomSource'

/** A source that always answers `value` and counts how often it was asked. */
function countingSource(value: number) {
  let draws = 0
  return {
    draws: () => draws,
    source: () => {
      draws++
      return value
    },
  }
}

describe('the ambient random source', () => {
  it('is the one randomize.ts re-exports, not a copy of it', () => {
    // A copy left behind in randomize.ts is the trap: the seeded wrappers and
    // every caller of randomize.withRandomSource would swap a source nothing
    // draws from.
    expect(randomize.withRandomSource).toBe(randomSource.withRandomSource)
    expect(randomize.random01).toBe(randomSource.random01)
    expect(randomize.randomRange).toBe(randomSource.randomRange)
    expect(randomize.randomPerturbation).toBe(randomSource.randomPerturbation)
    expect(randomize.createSeededRandomSource).toBe(
      randomSource.createSeededRandomSource,
    )
  })

  it('is restored when the call returns and when it throws', () => {
    const outer = countingSource(0.25)
    randomSource.withRandomSource(outer.source, () => {
      randomSource.withRandomSource(
        () => 0.75,
        () => randomSource.random01(),
      )
      expect(() =>
        randomSource.withRandomSource(
          () => 0.75,
          () => {
            throw new Error('inner')
          },
        ),
      ).toThrow('inner')
      expect(randomSource.random01()).toBe(0.25)
    })
    expect(outer.draws()).toBe(1)
  })

  it('reaches the primitives', () => {
    // Both ways a primitive draws: random01 and randomRange called directly,
    // and through randomPerturbation.
    const smart = countingSource(0.5)
    randomSource.withRandomSource(smart.source, () => {
      smartMutateAffine2D({ a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }, 0.5)
    })
    const coef = countingSource(0.5)
    randomSource.withRandomSource(coef.source, () =>
      randomizeAffineCoef(0, 'a', 0.5),
    )
    // At 0.5 the smart mutation takes five random01 draws (rotate, scale,
    // squash, flip, translate) and four randomRange draws (angle, scale, dx,
    // dy); randomPerturbation sums six uniform draws into its gaussian.
    expect({ smart: smart.draws(), coef: coef.draws() }).toEqual({
      smart: 9,
      coef: 6,
    })
  })

  it('reaches the mutation operators', () => {
    const { source, draws } = countingSource(0.5)
    const added = randomSource.withRandomSource(source, () =>
      countStructuralAdditions(0.75),
    )
    // Three draws under the chance add three transforms; the fourth is drawn
    // before the cap of three stops the loop.
    expect({ added, draws: draws() }).toEqual({ added: 3, draws: 4 })
  })
})
