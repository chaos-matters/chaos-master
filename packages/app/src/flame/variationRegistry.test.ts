import { describe, expect, it } from 'vitest'
import { isVariationTypeFor } from './variationRegistry'
import { variationTypes } from './variations'
import { variationTypes3D } from './variations3D'

describe('variation registry membership', () => {
  it('accepts own entries in the matching dimensional registry', () => {
    expect(isVariationTypeFor(2, 'linearVar')).toBe(true)
    expect(isVariationTypeFor(3, 'linear3D')).toBe(true)
    expect(isVariationTypeFor(2, 'linear3D')).toBe(false)
    expect(isVariationTypeFor(3, 'linearVar')).toBe(false)
  })

  it('never treats Object prototype properties as variation types', () => {
    expect(isVariationTypeFor(2, '__proto__')).toBe(false)
    expect(isVariationTypeFor(2, 'constructor')).toBe(false)
    expect(isVariationTypeFor(3, 'prototype')).toBe(false)
  })
})

// The fixture guard (src/fixtureRealism.test.ts) reads the registered names
// from this checked-in list: importing the registries took most of its time.
// This file loads them anyway, so it keeps the list in step. After adding,
// renaming or removing a variation, rewrite the list with
//   pnpm --filter chaos-master exec vitest run src/flame/variationRegistry.test.ts -u
describe('the checked-in list of registered variation names', () => {
  it('is the registries, sorted', async () => {
    const names = {
      '2D': [...variationTypes].sort(),
      '3D': [...variationTypes3D].sort(),
    }
    await expect(`${JSON.stringify(names, null, 2)}\n`).toMatchFileSnapshot(
      './__fixtures__/registeredVariationNames.json',
    )
  })
})
