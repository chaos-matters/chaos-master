import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Two properties of the ring are load-bearing and invisible in review.
 *
 * It sits ABOVE the lock's own banner and rail, because it points at the
 * editor the lock covers — and being above the lock is exactly what makes
 * `pointer-events: none` mandatory. A ring that swallowed clicks would sit over the Stop button and
 * the banner and quietly take the take away from the person watching.
 */
describe('PilotSpotlight stylesheet', () => {
  const css = readFileSync(
    join(import.meta.dirname, 'PilotSpotlight.module.css'),
    'utf8',
  )
  const overlay = readFileSync(
    join(import.meta.dirname, 'PilotOverlay.module.css'),
    'utf8',
  )
  const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '')

  function zIndexOf(body: string | undefined): number {
    const value = body === undefined ? undefined : /z-index:\s*(\d+)/.exec(body)
    expect(value?.[1]).toBeDefined()
    return Number(value?.[1])
  }

  it('never takes a click away from Stop', () => {
    const ring = /\.ring\s*\{[^{}]*\}/.exec(declarations)?.[0]
    expect(ring).toBeDefined()
    expect(/pointer-events:\s*none/.test(ring ?? '')).toBe(true)
  })

  it('stacks above everything it shares the lock with', () => {
    // It is drawn inside the lock's dialog (PilotOverlay.topLayer.test.tsx),
    // in the top layer with the banner and the rail.
    const shared = [
      ...overlay.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/z-index:\s*(\d+)/g),
    ].map((match) => Number(match[1]))
    expect(
      zIndexOf(/\.ring\s*\{[^{}]*\}/.exec(declarations)?.[0]),
    ).toBeGreaterThan(Math.max(0, ...shared))
  })
})
