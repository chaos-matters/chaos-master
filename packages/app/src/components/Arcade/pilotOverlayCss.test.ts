import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A centred box needs a width, and CSS will not say so.
 *
 * `left: 50%` with `right: auto` and no width makes an absolutely positioned
 * box shrink-to-fit against the *inset-modified* containing block — half the
 * viewport — so a one-line pill silently became a three-line block on a narrow
 * window. Four other centred elements in this app already carry the guard
 * (`width: max-content`, `white-space: nowrap`, or an explicit width); this
 * keeps the pilot overlay from being the fifth that forgets.
 */
describe('PilotOverlay stylesheet', () => {
  // Read as text, the way LoadFlameModal's dropzone styles are checked: a
  // CSS-module import under vitest is a proxy that answers every key.
  const css = readFileSync(
    join(import.meta.dirname, 'PilotOverlay.module.css'),
    'utf8',
  )

  it('gives every horizontally centred rule a width', () => {
    // Comments first: this file's own prose mentions `right: auto`, which a
    // naive scan would read as a declaration and skip the very rule it guards.
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const bodies = declarations.match(/\{[^{}]*\}/g) ?? []
    const centred = bodies.filter(
      (body) => /left:\s*50%/.test(body) && !/\bright:/.test(body),
    )
    expect(centred.length).toBeGreaterThan(0)
    for (const body of centred) {
      // `max-width` does NOT count: the box still shrink-to-fits against half
      // the containing block, and the cap only trims what is already too
      // narrow. Only a real `width` (or nowrap) fixes the sizing.
      const hasWidth = /(?:^|[;{\s])width:\s*(?!auto)[^;]+;/.test(body)
      const hasNowrap = /white-space:\s*nowrap/.test(body)
      expect(hasWidth || hasNowrap).toBe(true)
    }
  })
})
