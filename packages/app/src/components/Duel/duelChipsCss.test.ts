import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Two things only source order decides, so only a read of the file can pin.
 * A CSS-module import under vitest is a proxy that answers every key.
 */
describe('DuelChips stylesheet', () => {
  const css = readFileSync(
    join(import.meta.dirname, 'DuelChips.module.css'),
    'utf8',
  )

  it('lets the More tile override the swatch band it is built on', () => {
    // Same specificity everywhere, so the band rules the More tile changes
    // (display, border-style) only win by coming after every .swatchBand.
    const more = css.indexOf('.swatchMoreBand {')
    expect(more).toBeGreaterThan(css.lastIndexOf('.swatchBand {'))
    expect(more).toBeGreaterThan(css.lastIndexOf('.swatch {'))
  })

  it('defines every class the panel asks for', () => {
    // A CSS-module import under vitest answers every key, and a missing rule
    // renders as class={undefined} rather than as an error — which is how the
    // weight row under a variation tile shipped with no layout at all.
    const tsx = readFileSync(join(import.meta.dirname, 'DuelChips.tsx'), 'utf8')
    const used = new Set(
      [...tsx.matchAll(/\bui\.([A-Za-z0-9_]+)/g)].map((m) => m[1]!),
    )
    const defined = new Set(
      [...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1]!),
    )
    expect([...used].filter((name) => !defined.has(name))).toEqual([])
  })

  it('keeps the Shape grid to one explicit row, so 2D pays no hint gap', () => {
    const start = css.indexOf('.shape {')
    const shape = css.slice(start, css.indexOf('}', start))
    expect(shape).toMatch(/grid-template-rows:\s*minmax\(0, 1fr\);/)
  })
})
