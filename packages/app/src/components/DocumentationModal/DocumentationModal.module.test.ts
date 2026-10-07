/**
 * The Documentation dialog on a phone, in its stylesheet: the test DOM lays
 * nothing out.
 *
 * At 375x812 the tab bar ran 19px past the dialog, so the dialog panned
 * sideways; the catalogue, capped at 280px with its filter chips wrapping
 * over several rows, was a thin strip; and the chips were 23px tall.
 */
import { describe, expect, it } from 'vitest'
import { blockOf, declarationsFor, readCss } from '@/test/cssModule'

const css = readCss(
  'components/DocumentationModal/DocumentationModal.module.css',
)

const narrow = (selector: string) =>
  declarationsFor(blockOf(css, '@media (max-width: 760px)'), selector)
const coarse = (selector: string) =>
  declarationsFor(blockOf(css, '@media (pointer: coarse)'), selector)

describe('the Documentation dialog on a phone', () => {
  it('scrolls the tab bar inside the dialog instead of past it', () => {
    expect(narrow('.tab-bar')).toMatch(/max-width: 100%;/)
    expect(narrow('.tab-bar')).toMatch(/overflow-x: auto;/)
    expect(narrow('.tab')).toMatch(/flex-shrink: 0;/)
  })

  it('keeps the filter chips on one scrolling line', () => {
    expect(narrow('.category-row')).toMatch(/flex-wrap: nowrap;/)
    expect(narrow('.category-row')).toMatch(/overflow-x: auto;/)
    expect(narrow('.category-pill')).toMatch(/flex-shrink: 0;/)
  })

  it('gives the catalogue the larger share of the height, uncapped', () => {
    expect(narrow('.docs-layout')).toMatch(
      /grid-template-rows: minmax\(0, 3fr\) minmax\(0, 2fr\);/,
    )
    expect(declarationsFor(css, '.gallery-pane')).not.toMatch(/max-height/)
  })

  it('gives the tabs and the chips the full target on a coarse pointer', () => {
    expect(coarse('.tab')).toMatch(/min-block-size: var\(--la-tap\);/)
    expect(coarse('.category-pill')).toMatch(/min-block-size: var\(--la-tap\);/)
  })
})
