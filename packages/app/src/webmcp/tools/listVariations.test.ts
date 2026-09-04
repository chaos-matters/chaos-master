import { describe, expect, it } from 'vitest'
import { variationTypes } from '@/flame/variations'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { listVariations } from './listVariations'

type Listing = {
  dimensions: number
  total: number
  offset: number
  returned: number
  variations: (string | { name: string; params: string[] })[]
  truncated?: boolean
  next?: string
}

const call = async (input: unknown) =>
  (await listVariations.execute(input, {})) as Listing

const names = (listing: Listing) =>
  listing.variations.map((entry) =>
    typeof entry === 'string' ? entry : entry.name,
  )

describe('list_variations', () => {
  it('answers without a workspace, and pages the 2D registry', async () => {
    clearWebMcpContext()
    const first = await call({})
    expect(first.dimensions).toBe(2)
    expect(first.total).toBe(variationTypes.length)
    expect(first.returned).toBe(80)
    expect(first.truncated).toBe(true)
    expect(first.next).toContain('offset 80')
    const second = await call({ offset: 80 })
    expect(names(second)[0]).toBe(variationTypes[80])
  })

  /** The names an agent has to guess today. `linear` is not one of them. */
  it('names variations the way addTransform expects them', async () => {
    clearWebMcpContext()
    const starters = await call({ starters: true })
    expect(names(starters)).toContain('sphericalVar')
    expect(names(starters)).toContain('pdjVar')
    expect(names(starters)).not.toContain('spherical')
    expect(starters.truncated).toBeUndefined()
  })

  it('carries the parameter names of a parametric variation', async () => {
    clearWebMcpContext()
    const found = await call({ search: 'pdj', parametricOnly: true })
    expect(found.variations).toContainEqual({
      name: 'pdjVar',
      params: ['a', 'b', 'c', 'd'],
    })
  })

  it('lists the 3D registry for a 3D flame', async () => {
    const ctx = createMockCommandContext()
    const flame = createTestFlame()
    flame.renderSettings.dimensions = 3
    ctx.flameDescriptor = () => flame
    setWebMcpContext(ctx)
    const listing = await call({})
    expect(listing.dimensions).toBe(3)
    // The 3D registry does not use the `Var` suffix, which is the other half
    // of why guessing a name was hopeless.
    expect(names(listing).some((name) => name.endsWith('3D'))).toBe(true)
    expect(listing.total).toBeLessThan(variationTypes.length)
    clearWebMcpContext()
  })

  it('caps a caller that asks for everything at once', async () => {
    clearWebMcpContext()
    const listing = await call({ limit: 10_000 })
    expect(listing.returned).toBe(200)
  })
})
