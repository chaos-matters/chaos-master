/**
 * Settings and more on a coarse pointer, in its stylesheets: the test DOM
 * applies no CSS.
 *
 * At 375x812 its Close measured 22x22, the Glass panels checkbox 19x19 and
 * the segmented toggles 25px tall. On a coarse pointer each reaches the
 * touch minimum (--la-tap); a mouse keeps the compact sizes.
 */
import { describe, expect, it } from 'vitest'
import { blockOf, declarationsFor, readCss } from '@/test/cssModule'

const help = readCss('components/HelpModal/HelpModal.module.css')
const glass = readCss('components/HelpModal/GlassPanelsSetting.module.css')

const COARSE = '@media (pointer: coarse)'
const coarse = (css: string, selector: string) =>
  declarationsFor(blockOf(css, COARSE), selector)
const always = (css: string, selector: string) =>
  declarationsFor(css, selector, { topLevel: true })

describe('Settings and more on a coarse pointer', () => {
  it('gives Close the full target both ways', () => {
    expect(coarse(help, '.close-btn')).toMatch(
      /min-block-size: var\(--la-tap\);/,
    )
    expect(coarse(help, '.close-btn')).toMatch(
      /min-inline-size: var\(--la-tap\);/,
    )
  })

  it('keeps the hero clear of the larger Close', () => {
    expect(coarse(help, '.hero-section')).toMatch(
      /padding-right: calc\(var\(--la-tap\) \+ var\(--la-s-4\)\);/,
    )
  })

  it('gives the segmented toggles the full height', () => {
    expect(coarse(help, '.picker-mode-btn')).toMatch(
      /min-block-size: var\(--la-tap\);/,
    )
  })

  it('makes the Glass panels row, its checkbox label, the target', () => {
    expect(coarse(glass, '.row')).toMatch(/min-block-size: var\(--la-tap\);/)
  })

  it('reaches the touch minimum on the icon links without moving them', () => {
    // 30px to the eye, the hit area grown by an ::after centred on it.
    expect(always(help, '.icon-link')).toMatch(/width: 30px;/)
    const area = coarse(help, '.icon-link::after')
    expect(area).toMatch(/position: absolute;/)
    expect(area).toMatch(/inset: calc\(\(30px - var\(--la-tap\)\) \/ 2\);/)
    expect(coarse(help, '.icon-btn::after')).toBe(area)
    expect(coarse(help, '.icon-link')).toMatch(/position: relative;/)
  })

  it('spaces the icons so their hit areas do not overlap', () => {
    // Each area reaches (44 - 30) / 2 = 7px past its icon on both sides,
    // so neighbours need a 14px gap; --la-s-4 is 16px.
    expect(coarse(help, '.icon-row')).toMatch(/gap: var\(--la-s-4\);/)
  })

  it('leaves the mouse sizes alone', () => {
    for (const selector of ['.close-btn', '.picker-mode-btn']) {
      expect(always(help, selector)).not.toMatch(/min-(block|inline)-size/)
    }
    expect(always(glass, '.row')).not.toMatch(/min-block-size/)
  })
})
