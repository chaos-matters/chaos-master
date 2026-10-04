/**
 * The export tracker's job count on its glass, in the stylesheet: the test
 * DOM applies no CSS (ExportJobTracker.module.css).
 *
 * The count is white on a blue pill, and white on the pill's old blue,
 * #3b82f6, is 3.68:1: under the 4.5:1 its 10px text needs. Where the tracker
 * is glass, the dark theme and the touch layouts, the pill takes the next
 * blue down, --blue-600. The desktop's light theme keeps the card it had,
 * pill and all, like the rest of its look.
 *
 * Read from disk rather than imported, so it is registered in
 * scripts/always-on-tests.mjs.
 */
import { describe, expect, it } from 'vitest'
import { declarationsFor, readCss } from '@/test/cssModule'

const css = readCss('components/ExportJobs/ExportJobTracker.module.css')
const colors = readCss('styles/designSystem/colors.css')

const declarations = (selector: string) => declarationsFor(css, selector)

/** WCAG contrast of two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

describe('the export tracker count', () => {
  it('reads its fill from a hook that falls back to the old blue', () => {
    expect(declarations('.headerCount')).toMatch(
      /background:\s*var\(--tracker-count,\s*var\(--accent-color,\s*#3b82f6\)\);/,
    )
    expect(declarations('.headerCount')).toMatch(/color:\s*#fff;/)
  })

  it('is --blue-600 on the glass, and the old blue on the light card', () => {
    expect(declarations('.tracker')).toMatch(
      /--tracker-count:\s*var\(--blue-600\);/,
    )
    expect(
      declarations("[data-theme='light'] .tracker:not(.trackerTouch)"),
    ).toMatch(/--tracker-count:\s*initial;/)
  })

  it('holds its white text at 4.5:1 on the glass, where the old blue did not', () => {
    const blue600 = /--blue-600:\s*(#[0-9a-f]{6});/.exec(colors)?.[1]
    expect(blue600).toBeDefined()
    expect(contrast('#ffffff', blue600!)).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#ffffff', '#3b82f6')).toBeLessThan(4.5)
  })
})
