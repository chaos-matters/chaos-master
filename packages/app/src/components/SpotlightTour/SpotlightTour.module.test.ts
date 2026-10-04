/**
 * The tour card's glass, in its stylesheet: the test DOM applies no CSS.
 *
 * The panel sits on two children of the card, the layer behind its text and
 * the arrow, and not on the card. A blur on the card made it a backdrop root,
 * so the arrow, its child, could frost only the card's fill: its tip stood
 * darker than the frosted card over the art. The card fades by its children
 * for the same reason, as below full opacity it is a backdrop root too.
 */
import { describe, expect, it } from 'vitest'
import { blockOf, declarationsFor, readCss } from '@/test/cssModule'

const css = readCss('components/SpotlightTour/SpotlightTour.module.css')

const declarations = (selector: string) => declarationsFor(css, selector)

const keyframes = (name: string) =>
  // eslint-disable-next-line security/detect-non-literal-regexp -- a keyframes name this test writes
  blockOf(css, new RegExp(`@keyframes ${name}\\s*\\{`))

const PANEL =
  /composes:\s*panel\s+from\s+'@\/styles\/designSystem\/glass\.module\.css'/

describe('the tour card stylesheet', () => {
  it('puts the panel on the layer and the arrow, not on the card', () => {
    expect(declarations('.glassLayer')).toMatch(PANEL)
    expect(declarations('.glassArrow')).toMatch(PANEL)
    expect(declarations('.glassCard')).not.toMatch(/composes|backdrop-filter/)
  })

  it('lets the glass card rise while its children fade in', () => {
    expect(declarations('.glassCard')).toMatch(/animation-name:\s*cardRise;/)
    expect(keyframes('cardRise')).toMatch(/transform/)
    expect(keyframes('cardRise')).not.toMatch(/opacity/)
    expect(declarations('.glassCard > *')).toMatch(/animation:\s*cardFade\s/)
    expect(keyframes('cardFade')).toMatch(/opacity/)
  })

  it('draws no shadow on the layer or the arrow', () => {
    // The layer's shadow, drawn after the arrow, darkened it below the card.
    expect(declarations('.glassLayer')).toMatch(/box-shadow:\s*none;/)
    expect(declarations('.glassArrow')).toMatch(/box-shadow:\s*none;/)
  })

  it.each(['top', 'bottom', 'left', 'right'])(
    "breaks the layer's edge for an arrow on its %s side",
    (side) => {
      // The edge ran on across the arrow's base, as bright as the outline.
      // The break stops 10px from the arrow's middle, short of the base's
      // ends at 11.31px: stopping at 11px left the art showing in a sliver
      // of the edge there, between the break and the arrow's 2px band.
      const rule = declarations(`.glassLayer[data-seam='${side}']`)
      expect(rule).toMatch(/mask:/)
      expect(rule).toMatch(/var\(--seam-at\) - 10px/)
      expect(rule).toMatch(/var\(--seam-at\) \+ 10px/)
    },
  )

  it.each(['Top', 'Bottom', 'Left', 'Right'])(
    'lets the glass arrow%s fill the break, 2px past its diagonal',
    (side) => {
      expect(declarations(`.glassCard .arrow${side}`)).toMatch(
        /clip-path:[^;]*2\.828px/,
      )
    },
  )

  it("gives the arrow the light card's fill only", () => {
    // Inherited on glass, it would take the card's fill, which is none.
    expect(declarations('.arrow')).not.toMatch(/background/)
    expect(declarations('.card:not(.glassCard) .arrow')).toMatch(
      /background:\s*inherit/,
    )
  })
})
