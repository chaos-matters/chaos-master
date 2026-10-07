/**
 * The Benchmark Lab's header buttons on a coarse pointer, in the
 * stylesheet: the test DOM applies no CSS. At 375x812 "Classic" measured
 * 50x30 and "Editor" 44x30, set to 30px by the narrow layout.
 */
import { describe, expect, it } from 'vitest'
import { blockOf, blocksOf, declarationsFor, readCss } from '@/test/cssModule'

const css = readCss('pages/Benchmarks/BenchmarksPage.module.css')
const COARSE = '@media (pointer: coarse)'

describe("the Benchmark Lab's header buttons", () => {
  it.each(['.headerActions .button', '.headerActions .buttonQuiet'])(
    '%s reaches the touch minimum on a coarse pointer',
    (selector) => {
      const rule = declarationsFor(blockOf(css, COARSE), selector)
      expect(rule).toMatch(/min-block-size: var\(--la-tap\);/)
      expect(rule).toMatch(/min-inline-size: var\(--la-tap\);/)
    },
  )

  it("comes after the narrow layout's 30px, so it wins", () => {
    const lines = blocksOf(css)
      .filter((block) => block.selector.startsWith('@media'))
      .map((block) => ({ selector: block.selector, line: block.line }))
    const narrow = lines.find((b) => b.selector === '@media (max-width: 560px)')
    const coarse = lines.find((b) => b.selector === COARSE)
    expect(narrow).toBeDefined()
    expect(coarse!.line).toBeGreaterThan(narrow!.line)
  })
})
