/**
 * breed_flames builds every child it is asked for on the main thread, and it
 * is read-only, so it runs even while an Arcade session holds the lock. Its
 * count is held to a ceiling, and anything that is not a finite number is
 * read as the default.
 */
import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { breedFlamesTool, MAX_BRED_CHILDREN } from './breedFlames'

const breed = (count?: unknown) =>
  breedFlamesTool.execute(
    { flameA: examples.example1, flameB: examples.example2, count },
    {},
  ) as { success?: boolean; children?: unknown[]; error?: string }

describe('breed_flames count', () => {
  it('holds a count past the ceiling to the ceiling', () => {
    const result = breed(MAX_BRED_CHILDREN * 5)
    expect(result.success).toBe(true)
    expect(result.children).toHaveLength(MAX_BRED_CHILDREN)
  })

  it('breeds at least one child, and whole children only', () => {
    expect(breed(0).children).toHaveLength(1)
    expect(breed(2.7).children).toHaveLength(2)
  })

  it('reads a count that is not a finite number as the default of 3', () => {
    expect(breed(Number.NaN).children).toHaveLength(3)
    expect(breed(Number.POSITIVE_INFINITY).children).toHaveLength(3)
    expect(breed().children).toHaveLength(3)
  })
})
