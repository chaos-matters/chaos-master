/**
 * The Glass panels gate, as glass.module.css writes it (the test DOM applies
 * no CSS). optionalPanel is the one place the setting and the theme decide
 * whether a large surface is glass, so every surface that composes it gets
 * the same answer: glass only with the setting on and outside the light
 * theme, solid while busy, one blur when nested, and the controls and text
 * tiers that glass needs.
 *
 * Read from disk rather than imported: the test runtime turns a CSS module
 * import into class names. So it is registered in scripts/always-on-tests.mjs.
 */
import { describe, expect, it } from 'vitest'
import { blocksOf, declarationsFor, readCss } from '@/test/cssModule'

const css = readCss('styles/designSystem/glass.module.css')

const GATE =
  ":global(:root[data-glass-panels='on']) :global(body:not([data-theme='light']))"

describe('the optionalPanel gate', () => {
  it('is glass only behind the setting and outside the light theme', () => {
    const on = declarationsFor(css, `${GATE} .optionalPanel`)
    expect(on).toMatch(/background:\s*var\(--la-glass-panel\);/)
    expect(on).toMatch(/-webkit-backdrop-filter:\s*var\(--la-glass-blur\);/)
    expect(on).toMatch(/backdrop-filter:\s*var\(--la-glass-blur\);/)
    // Nothing reaches the surface without the gate in front of it.
    const ungated = blocksOf(css).filter(({ selectors }) =>
      selectors.some(
        (s) => s.includes('.optionalPanel') && !s.includes('data-glass-panels'),
      ),
    )
    expect(ungated).toEqual([])
  })

  it('gives glass text and controls what they need there', () => {
    const on = declarationsFor(css, `${GATE} .optionalPanel`)
    expect(on).toMatch(/--la-ink-3:\s*var\(--la-ink-2\);/)
    expect(on).toMatch(/--la-control:\s*var\(--la-control-on-glass\);/)
    expect(on).toMatch(
      /--la-control-strong:\s*var\(--la-control-strong-on-glass\);/,
    )
    expect(on).toMatch(
      /--la-control-accent:\s*var\(--la-control-accent-on-glass\);/,
    )
    // The same values as solidControls, which the deck and the rail compose.
    const solid = declarationsFor(css, '.solidControls')
    for (const name of [
      '--la-control',
      '--la-control-strong',
      '--la-control-accent',
    ]) {
      const value = (block: string) =>
        // eslint-disable-next-line security/detect-non-literal-regexp -- a custom property name from the list above
        new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1]
      expect(value(on), name).toBe(value(solid))
    }
  })

  it('goes solid while the canvas is busy', () => {
    const busy = declarationsFor(
      css,
      ":global(:root[data-glass-panels='on'][data-glass='busy']) :global(body:not([data-theme='light'])) .optionalPanel",
    )
    expect(busy).toMatch(/background:\s*var\(--la-glass-solid\);/)
    expect(busy).toMatch(/backdrop-filter:\s*none;/)
  })

  it('keeps one blur when glass nests in it or it nests in glass', () => {
    const inside = declarationsFor(
      css,
      `${GATE} :is(.chrome, .panel, .flat, .solid, .optionalPanel) .optionalPanel`,
    )
    const around = declarationsFor(
      css,
      `${GATE} .optionalPanel :is(.chrome, .panel, .flat, .solid)`,
    )
    for (const block of [inside, around]) {
      expect(block).toMatch(/-webkit-backdrop-filter:\s*none;/)
      expect(block).toMatch(/backdrop-filter:\s*none;/)
    }
  })

  it('leaves the edge, the shadow and the transition to the surface', () => {
    const on = declarationsFor(css, `${GATE} .optionalPanel`)
    expect(on).not.toMatch(/(^|[\s;])(border|box-shadow|transition)\s*:/)
  })
})
