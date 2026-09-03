import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Read the stylesheet as text rather than importing the CSS module: under vitest
// a CSS-module import resolves to a proxy that answers every key, so it can
// never tell us a class is missing — which is exactly the bug this guards.
// These assertions are regexes, and a regex matches happily inside a file that
// no longer parses — a partial edit once left orphaned rules here and every one
// of them still passed. Two things catch that now, neither of them here:
// prettier's pre-commit hook rejects the file, and
// `tests/load-flame-dropzone.spec.ts` asserts the computed styles and geometry
// in a real browser, so a rule that stops applying fails loudly.
const css = readFileSync(
  join(import.meta.dirname, 'LoadFlameModal.module.css'),
  'utf8',
)

const dragBlock = () => {
  const start = css.indexOf('.uploadZoneDragging {')
  // Stop at the nested rules so the assertions below read only the zone's own
  // declarations, not those of its children.
  const end = css.indexOf('  .uploadIcon {', start)
  return css.slice(start, end === -1 ? undefined : end)
}

describe('upload dropzone styles', () => {
  // The component has always toggled `ui.uploadZoneDragging` on drag, but the
  // class was never defined here. `ui.uploadZoneDragging` was `undefined`, so
  // the element got a literal class named "undefined" and a drag changed only
  // the wording — no border, no fill, nothing saying the drop was valid.
  it('defines the drag-hover class the component toggles', () => {
    expect(css).toMatch(/^\.uploadZoneDragging\s*\{/m)
  })

  it('gives the drag state a visible border and fill, not just a text swap', () => {
    const block = dragBlock()
    expect(block).toMatch(/border-color:/)
    expect(block).toMatch(/background:/)
    // The resting zone is dashed; a solid border is the "now it will take it"
    // signal, so it must not silently regress to dashed.
    expect(block).toMatch(/border-style:\s*solid/)
  })

  // Regression: the first version grew the border to 2px and scaled to 1.01,
  // which pushed the zone past the modal's left edge while dragging over it.
  // The ring has to be painted inside the existing box instead.
  it('changes no box dimension, so it cannot overflow the modal edge', () => {
    const block = dragBlock()
    expect(block).not.toMatch(/border-width:/)
    expect(block).not.toMatch(/transform:\s*scale/)
    expect(block).not.toMatch(/(^|[^-])padding:/)
    expect(block).not.toMatch(/\bmargin:/)
    // The ring is an inset shadow, which paints within the border box.
    expect(block).toMatch(/box-shadow:\s*inset/)
  })

  it('honours reduced motion for the icon nudge', () => {
    expect(css).toMatch(/prefers-reduced-motion/)
  })
})

describe('format pills', () => {
  it('styles the pills and the size note distinctly', () => {
    expect(css).toMatch(/^\.formatPills\s*\{/m)
    expect(css).toMatch(/^\.formatPill\s*\{/m)
    // The limit is not a format; it must not reuse the pill chrome.
    expect(css).toMatch(/^\.sizeLimit\s*\{/m)
  })

  it('lets the pills wrap rather than overflow a narrow modal', () => {
    const block = css.slice(css.indexOf('.formatPills {'))
    expect(block).toMatch(/flex-wrap:\s*wrap/)
  })
})

describe('info tooltip', () => {
  it('is hidden until hover, focus or an expanded press', () => {
    const block = css.slice(css.indexOf('.infoTooltip {'))
    expect(block).toMatch(/visibility:\s*hidden/)
    expect(block).toMatch(/:hover/)
    // Keyboard users get it too, and aria-expanded carries touch.
    expect(block).toMatch(/focus-within/)
    expect(block).toMatch(/aria-expanded='true'/)
  })
})
