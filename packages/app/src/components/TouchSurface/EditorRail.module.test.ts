import { describe, expect, it } from 'vitest'
import { declarationsFor, readCss } from '@/test/cssModule'
import { PEEK_HEIGHT, SHEET_EASING, SHEET_TRANSITION_MS } from './detents'

/** The row's arithmetic lives in the stylesheet; the test DOM applies no CSS. */
const css = readCss('components/TouchSurface/EditorRail.module.css')

/** Top-level rules only: inside an @media block a rule applies sometimes. */
const declarations = (selector: string) =>
  declarationsFor(css, selector, { topLevel: true })

describe('the editor rail stylesheet', () => {
  it('lets the chips narrow past the tap token, keeping their height', () => {
    // --la-tap becomes 48px under [data-platform='android'], and the peek row
    // also holds the capsule and the shutter. At 360px four 48px chips wanted
    // 198px of a 190px box, so the row scrolled and "Vary" was clipped behind
    // the shutter. Width is the only dimension that may give: the tappable
    // box stays --la-tap tall, which clears the 40px floor on both platforms.
    const chip = declarations('.chip')
    const minWidth = /min-width:\s*([0-9.]+)px/.exec(chip)
    expect(minWidth, 'the chip needs a fixed minimum width').not.toBeNull()
    expect(Number(minWidth?.[1])).toBeLessThan(44)
    expect(Number(minWidth?.[1])).toBeGreaterThanOrEqual(40)
    expect(chip).toMatch(/height:\s*var\(--la-tap\)/)
  })

  it('fills the controls on the glass sheet as the floating deck does', () => {
    // With the Glass panels setting on, the open sheet is glass. The control
    // tokens (lumen.css) default to translucent washes, which darken and
    // lighten row by row with the art behind the sheet; the deck and the
    // explorer fill their controls with opaque surfaces instead, and the
    // sheet takes them from the same place in the primitive.
    expect(declarations('.glassPanel')).toMatch(
      /composes:\s*panel solidControls from '@\/styles\/designSystem\/glass\.module\.css';/,
    )
    const deck = readCss('components/TouchSurface/TabletDeck.module.css')
    expect(deck).toMatch(
      /^\.floating\s*\{[^}]*composes:\s*solidControls from '@\/styles\/designSystem\/glass\.module\.css';/m,
    )
    // The selected chip's own wash is translucent too; on the glass sheet it
    // takes the opaque accent fill, as the deck's selected tab does.
    const selected = declarations(
      ".sheet.glassPanel .chip[aria-selected='true']",
    )
    expect(selected).toMatch(/background:\s*var\(--la-control-accent\);/)
  })

  it('gives the shutter a fill its accent icon holds 3:1 on by itself', () => {
    // Ember over --la-glass (72%) is 2.86:1 with white-hot art behind it,
    // under the 3:1 an icon needs (glassContrast.test.ts has the table). The
    // sheet behind the shutter lifted that in place; the shutter's own fill,
    // --la-glass-strong (86%), now holds 4.79:1 without it.
    const shutter = declarations('.shutter')
    expect(shutter).toMatch(/background:\s*var\(--la-glass-strong\);/)
    expect(shutter).toMatch(/color:\s*var\(--la-accent\);/)
  })

  it('slides the canvas only by --rail-inset, which the glass sheet leaves at 0', () => {
    // Under the opaque sheet the canvas slides up by half the height the
    // sheet covers, as it did before there was glass. Under the glass sheet
    // CanvasViewport writes 0 there and the camera frames the flame above
    // the sheet instead (CanvasViewport.framing.test.tsx), so the canvas
    // runs on under the glass and no strip of its box is left bare. Nothing
    // paints that strip any more, and nothing needs to.
    const app = readCss('App.module.css')
    expect(app).toMatch(
      /transform:\s*translateY\(calc\(var\(--rail-inset, 0px\) \/ -2\)\)/,
    )
    expect(app).not.toMatch(/--canvas-ground/)
  })

  it("keeps the camera's easing to the sheet's own transition", () => {
    // The camera cannot run a CSS transition, so CanvasViewport eases the
    // framing along SHEET_TRANSITION_MS and SHEET_EASING. They must be the
    // sheet's duration and curve, and the opaque sheet's slide's, or the
    // flame would lag the sheet or run ahead of it.
    const lumen = readCss('styles/designSystem/lumen.css')
    const duration = /--la-dur-sheet:\s*([0-9.]+)ms;/.exec(lumen)?.[1]
    expect(Number(duration)).toBe(SHEET_TRANSITION_MS)
    const curve = /--la-ease:\s*cubic-bezier\(([^)]*)\);/.exec(lumen)?.[1]
    expect(curve?.split(',').map(Number)).toEqual([...SHEET_EASING])
    expect(declarations('.sheet')).toMatch(
      /transition:\s*height var\(--la-dur-sheet\) var\(--la-ease\);/,
    )
    const app = readCss('App.module.css')
    expect(app).toMatch(
      /\n\.canvas\s*\{[^}]*transition:\s*transform var\(--la-dur-sheet\) var\(--la-ease\);/,
    )
  })

  it('is PEEK_HEIGHT tall at peek, with nothing left over under the row', () => {
    // detents.ts sizes the sheet and the stylesheet fills it: two glass
    // edges, the grabber row and the peek row. When the two parted (96
    // against 90 of rows) the controls sat 6px further from the bottom edge
    // than from the sides. Both rows hold their height at every detent: as
    // flex items they shrank when the sheet opened, the grabber row from 24px
    // to 13, and the peek row jumped up.
    const lumen = readCss('styles/designSystem/lumen.css')
    const px = (pattern: RegExp, text: string) =>
      Number(pattern.exec(text)?.[1] ?? Number.NaN)
    const grabberRow = declarations('.grabberRow')
    const peekRow = declarations('.peekRow')
    expect(grabberRow).toMatch(/flex:\s*none;/)
    expect(peekRow).toMatch(/flex:\s*none;/)
    expect(peekRow).toMatch(/box-sizing:\s*border-box;/)
    expect(peekRow).toMatch(/height:\s*var\(--la-rail-h\);/)
    // 8px under the controls, as at their sides, whatever the capsule's size:
    // a narrow phone's smaller capsule leaves the row's spare height above
    // them. With the padding fixed at 0 8 8 the 48px capsule sat 12px clear
    // of the bottom and 8 of the sides.
    expect(peekRow).toMatch(
      /padding:\s*calc\(var\(--la-rail-h\) - var\(--la-capsule\) - var\(--la-s-2\)\)\s+var\(--la-s-2\) var\(--la-s-2\);/,
    )
    // Every platform's value, Android's block included.
    const railRows = [...lumen.matchAll(/--la-rail-h:\s*([0-9.]+)px;/g)].map(
      (match) => Number(match[1]),
    )
    expect(railRows.length).toBeGreaterThan(0)
    expect(new Set(railRows).size).toBe(1)
    const edge = px(/--la-glass-edge:\s*([0-9.]+)px/, lumen)
    expect(
      px(/(?:^|\s)height:\s*([0-9.]+)px;/, grabberRow) +
        railRows[0]! +
        2 * edge,
    ).toBe(PEEK_HEIGHT)
  })

  it('rounds all four corners of a sheet that floats off every edge', () => {
    // The dock pads the sheet off the bottom of the screen as well as the
    // sides; with only its top corners round it read as a card cut off.
    expect(declarations('.sheet')).toMatch(
      /border-radius:\s*var\(--la-r-sheet\);/,
    )
  })
})
