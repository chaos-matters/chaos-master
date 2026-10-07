import { describe, expect, it } from 'vitest'
import { declarationsFor, readCss } from '@/test/cssModule'

/**
 * Stacking and hit testing live in the stylesheet, and the test DOM applies
 * no CSS, so these read the rules themselves. The bugs they cover were
 * invisible to every rendering test: the element was in the tree, correct,
 * and untappable.
 */
const css = readCss('components/Shell/ShellBar.module.css')

/**
 * The declarations of the rules whose selector is exactly `selector`, with
 * whitespace folded - so a selector prettier wrapped over three lines is one
 * string again, which is how the Android rules are written. Top-level rules
 * only: a declaration moved into an @media block applies only sometimes,
 * and must fail the guard that pins it.
 */
const declarations = (selector: string) =>
  declarationsFor(css, selector, { topLevel: true })

describe('the shell bar stylesheet', () => {
  it('lifts the expanded capsule bar over the row beside it', () => {
    // The bar opens absolutely inside EditorRail's `.leading`, which precedes
    // `.chips` in the DOM. With no stacking order of its own the chips paint,
    // and hit-test, on top of it: Library was unreachable from Create.
    const z = /z-index:\s*(\d+)/.exec(declarations('.capsuleDock.expanded'))
    expect(z, 'the expanded dock needs a stacking order').not.toBeNull()
    expect(Number(z?.[1])).toBeGreaterThan(0)
  })

  it('opens the capsule over the chips without showing them through it', () => {
    // Expanded, the bar paints over the rail's first chips. At the strong
    // glass's 86% the covered label showed on both sides of Library. The bar
    // is opaque, as tall as the capsule it grows from (narrow phones shrink
    // the capsule, lumen.css), and the capsule is its end cap rather than
    // sitting 5px inside it.
    const bar = declarations('.capsuleDock .bar')
    expect(bar).toMatch(/background:\s*var\(--la-ground\);/)
    expect(bar).toMatch(/height:\s*var\(--la-capsule\);/)
    expect(bar).toMatch(/padding-inline-start:\s*0;/)
  })

  it('lets the More backdrop take the tap that closes the menu', () => {
    // The backdrop sits inside `.dock`, which is `pointer-events: none` so
    // the canvas stays reachable beside the bar. `.row`, `.more` and `.menu`
    // each take it back; the backdrop did not, so on a phone with no system
    // back a tap outside the menu fell through to the gallery plate
    // underneath and the menu stayed up.
    expect(declarations('.backdrop')).toMatch(/pointer-events:\s*auto/)
  })

  it('closes the seam between the Android bar and its More box', () => {
    // M3 expects one surface across the width. The gap was zeroed on `.dock`,
    // whose only in-flow child is `.row`, so it applied to nothing: the 8px
    // strip between the bar and the More box is the row's own gap, and the
    // row has no background, so the page showed through the seam.
    expect(
      declarations(
        ":global(:root[data-platform='android']) .dock:not(.capsuleDock) .row",
      ),
    ).toMatch(/gap:\s*0/)
  })
})
