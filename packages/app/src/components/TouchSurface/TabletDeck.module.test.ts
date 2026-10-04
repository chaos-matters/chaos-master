/**
 * The tablet deck's two modes as the stylesheets write them, which the test
 * DOM does not apply: the opaque page by default, and with the Glass panels
 * setting on the glass over a canvas that runs under it, whose controls take
 * an opaque fill of their own (TabletDeck.module.css), and the hover badge
 * centred on what the deck leaves of that canvas (App.module.css).
 *
 * Read from disk rather than imported: the test runtime turns a CSS module
 * import, `?raw` included, into class names. So it is registered in
 * scripts/always-on-tests.mjs.
 */
import { describe, expect, it } from 'vitest'
import { blockOf, declarationsFor as declarations, readCss, } from '@/test/cssModule'

const deck = readCss('components/TouchSurface/TabletDeck.module.css')
const app = readCss('App.module.css')
const lumen = readCss('styles/designSystem/lumen.css')
const glass = readCss('styles/designSystem/glass.module.css')

/** The value of a custom property in a block of declarations, spaces folded. */
function token(block: string, name: string): string | undefined {
  const escaped = name.replace(/[-]/g, '\\-')
  // eslint-disable-next-line security/detect-non-literal-regexp -- a custom property name this test writes
  return new RegExp(`${escaped}:\\s*([^;]+);`)
    .exec(block)?.[1]
    ?.replace(/\s+/g, ' ')
    .trim()
}

/** lumen.css's first `:root` block, the defaults. */
const lumenRoot = blockOf(lumen, /^\s*:root\s*\{/m)

/** `share`% of the colour `of`, mixed onto `onto`. */
const mix = (share: number, of: string, onto = 'var(--la-surface)') =>
  `color-mix(in srgb, var(${of}) ${share}%, ${onto})`

/** A value with the formatter's line breaks inside brackets taken out. */
const flat = (value: string | undefined) =>
  value?.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')

describe('the tablet deck stylesheet', () => {
  it('fills only the page, so the glass panel shows when it floats', () => {
    // The deck's own rule sets no fill: the page adds the opaque one, and
    // floating, the primitive's panel class supplies the glass.
    expect(declarations(deck, '.deck')).not.toMatch(/background/)
    const page = declarations(deck, '.page')
    expect(page).toMatch(/background:\s*var\(--la-surface\);/)
    expect(page).toMatch(/border-left:\s*1px solid var\(--la-hairline\);/)
    expect(declarations(deck, '.floating')).not.toMatch(/background/)
  })

  it('gives the controls an opaque fill of their own when floating', () => {
    // The controls fill with the control tokens (TouchSurface.module.css).
    // On the page they are the hairline washes they always were (lumen.css).
    // Floating, the deck makes them the explorer's opaque fills, so bright
    // art does not show through a chip and text on one is not on glass.
    expect(token(lumenRoot, '--la-control')).toBe('var(--la-hairline)')
    expect(token(lumenRoot, '--la-control-strong')).toBe(
      'var(--la-hairline-strong)',
    )
    expect(token(lumenRoot, '--la-control-accent')).toBe(
      'var(--la-accent-wash)',
    )

    // It takes them from the primitive, which every glass surface shares.
    expect(declarations(deck, '.floating')).toMatch(
      /composes:\s*solidControls from '@\/styles\/designSystem\/glass\.module\.css';/,
    )
    const solid = declarations(glass, '.solidControls')
    expect(token(solid, '--la-control')).toBe('var(--la-control-on-glass)')
    expect(token(solid, '--la-control-strong')).toBe(
      'var(--la-control-strong-on-glass)',
    )
    expect(token(solid, '--la-control-accent')).toBe(
      'var(--la-control-accent-on-glass)',
    )
    expect(token(lumenRoot, '--la-control-on-glass')).toBe(
      'var(--la-surface-2)',
    )
    expect(token(lumenRoot, '--la-control-strong-on-glass')).toBe(
      'var(--la-surface-3)',
    )
    const wash = /var\(--la-accent\) ([0-9.]+)%, transparent/.exec(
      token(lumenRoot, '--la-accent-wash') ?? '',
    )?.[1]
    expect(flat(token(lumenRoot, '--la-control-accent-on-glass'))).toBe(
      flat(mix(Number(wash), '--la-accent', 'var(--la-surface-2)')),
    )
  })

  it('leaves the hairlines translucent when floating', () => {
    // Remapped onto --la-surface, as they were, they made a control's edge
    // the colour of its own fill, and the lines on the glass itself (the
    // divider's grip, the header's rule) darker than the glass over bright
    // art, where they vanished.
    const floating = declarations(deck, '.floating')
    for (const name of [
      '--la-hairline',
      '--la-hairline-strong',
      '--la-accent-wash',
    ]) {
      expect(token(floating, name), name).toBeUndefined()
      // Nor anywhere else in the stylesheet, a More Contrast block included.
      expect(token(deck, name), name).toBeUndefined()
    }
    expect(declarations(deck, '.divider::after')).toMatch(
      /background:\s*var\(--la-hairline-strong\);/,
    )
    expect(declarations(deck, '.header')).toMatch(
      /border-bottom:\s*1px solid var\(--la-hairline\);/,
    )
  })

  it('keeps text on the glass at ink-2 or brighter when floating', () => {
    // Decision c: on the panel's 80% fill, ink and ink-2 only.
    expect(token(declarations(deck, '.floating'), '--la-ink-3')).toBe(
      'var(--la-ink-2)',
    )
  })
})

describe('the tablet layout grid', () => {
  it('runs the canvas under the deck only with the Glass panels setting on', () => {
    const spans = [
      ...app.matchAll(/([^{}]*)\{[^}]*grid-column-end:\s*inspector/g),
    ]
    expect(
      spans.map((m) => m[1]?.replace(/\/\*[\s\S]*?\*\//g, '').trim()),
    ).toEqual([
      ":global(:root[data-glass-panels='on']) .tabletLayout .canvas-container",
    ])
  })
})

describe('the hover badge', () => {
  it('centres on the part of the canvas the floating deck leaves', () => {
    // CanvasViewport sets --covered-right on the canvas box while the deck
    // floats open over it, and leaves it unset otherwise: half of a 1100 px
    // canvas under a 380 px deck is 360 px, not 550.
    expect(declarations(app, '.hover-preview-badge')).toMatch(
      /left:\s*calc\(\(1 - var\(--covered-right, 0\)\) \* 50%\);/,
    )
  })
})
