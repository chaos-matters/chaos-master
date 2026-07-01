import { describe, expect, it } from 'vitest'
import { safeDenom } from './safeMath'

// tgpu.fn bodies are also executable as plain JS (with f32 coercion on the
// argument and result, matching the GPU), so the guard can be exercised here.
// It also resolves to WGSL — see ifsPipeline.resolveAll.test.ts.
describe('safeDenom', () => {
  it('returns the value unchanged when non-zero', () => {
    // Exactly-representable f32 values pass through untouched.
    expect(safeDenom(2)).toBe(2)
    expect(safeDenom(-0.5)).toBe(-0.5)
  })

  it('substitutes a tiny non-zero epsilon for exactly zero', () => {
    const out = safeDenom(0)
    expect(out).not.toBe(0)
    expect(out).toBeGreaterThan(0)
    expect(out).toBeCloseTo(1e-9, 12)
  })

  it('keeps a subsequent division finite at zero', () => {
    expect(Number.isFinite(1 / safeDenom(0))).toBe(true)
  })
})
