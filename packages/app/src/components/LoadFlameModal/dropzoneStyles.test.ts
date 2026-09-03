import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Read the stylesheet as text rather than importing the CSS module: under vitest
// a CSS-module import resolves to a proxy that answers every key, so it can
// never tell us a class is missing — which is exactly the bug this guards.
const css = readFileSync(
  join(import.meta.dirname, 'LoadFlameModal.module.css'),
  'utf8',
)

describe('upload dropzone styles', () => {
  // The component has always toggled `ui.uploadZoneDragging` on drag, but the
  // class was never defined here. `ui.uploadZoneDragging` was `undefined`, so
  // the element got a literal class named "undefined" and a drag changed only
  // the wording — no border, no fill, nothing saying the drop was valid.
  it('defines the drag-hover class the component toggles', () => {
    expect(css).toMatch(/^\.uploadZoneDragging\s*\{/m)
  })

  it('gives the drag state a visible border and fill, not just a text swap', () => {
    const block = css.slice(css.indexOf('.uploadZoneDragging {'))
    expect(block).toMatch(/border-color:/)
    expect(block).toMatch(/background:/)
    // The resting zone is dashed; a solid border is the "now it will take it"
    // signal, so it must not silently regress to dashed.
    expect(block).toMatch(/border-style:\s*solid/)
  })

  it('honours reduced motion for the drag transform', () => {
    expect(css).toMatch(/prefers-reduced-motion/)
  })
})
