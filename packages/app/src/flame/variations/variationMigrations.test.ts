// The variation migration map lives in core, but the registry it must agree
// with lives here. A typo in a map value is invisible at runtime -- the flame
// validates and renders as something else -- so this is the check that sees it.
import { VARIATION_TYPE_MIGRATIONS } from '@chaos-master/core/schema/migrateFlameTypes'
import { describe, expect, it } from 'vitest'
import { isVariationType } from './index'

describe('VARIATION_TYPE_MIGRATIONS against the registry', () => {
  it('maps every legacy name onto a variation that actually exists', () => {
    const missing = Object.entries(VARIATION_TYPE_MIGRATIONS)
      .filter(([, to]) => !isVariationType(to))
      .map(([from, to]) => `${from} -> ${to}`)
    expect(missing).toEqual([])
  })
})
