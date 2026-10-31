/**
 * A drag on a touch screen must not select the text beside the control or
 * raise the iOS callout: on an iPhone, dragging a variation's weight slider
 * selected its label (maff, testing 0.9.13 on dev).
 *
 * WHERE A DRAG STARTS. Each slider and scrub control turns off selection
 * and the callout on the box the finger lands in, label and value included,
 * in both spellings: iOS Safari reads only -webkit-user-select (caniuse-lite
 * 1.0.30001797, the version in this repo, marks user-select "prefix
 * required" on Safari and iOS Safari through 26.5), and the phone sheet's
 * variation rows had neither.
 *
 * TEXT FIELDS STAY SELECTABLE. WebKit inherits -webkit-user-select, so on
 * iOS a field inside one of those boxes (ScrubInput's typed edit) can take
 * its `none`. The preflight gives every field that takes typing `text` back,
 * at zero specificity, and ScrubInput's own field says so too.
 *
 * TWO SPELLINGS EVERYWHERE. For the same reason a rule anywhere that writes
 * `user-select` alone changes nothing on an iPhone: 66 rules did, among
 * them the affine and colour editors' drag handles and the timeline header.
 * So every user-select in any stylesheet has a -webkit-user-select of the
 * same value in the same rule, and the other way round. The build keeps both
 * (LightningCSS writes the -webkit- one first and drops neither, unlike
 * backdrop-filter, glassBlurs.test.ts).
 *
 * Chromium cannot show the iOS behaviour; the touch-polish browser check
 * reads the computed styles and the shipped CSS on an iPhone 13 Pro
 * descriptor instead.
 */
import { describe, expect, it } from 'vitest'
import { blocksOf, declarationsFor, readCss, readStylesheets, } from '@/test/cssModule'

const STANDARD = 'user-select'
const PREFIXED = '-webkit-user-select'

/** Each user-select in a stylesheet whose other spelling is missing from its rule. */
function twinOffenders(css: string, file: string): string[] {
  const offenders: string[] = []
  for (const block of blocksOf(css)) {
    const values = (property: string) =>
      block.declarations.filter((d) => d.property === property)
    for (const [property, other] of [
      [STANDARD, PREFIXED],
      [PREFIXED, STANDARD],
    ] as const) {
      for (const d of values(property)) {
        if (!values(other).some((twin) => twin.value === d.value)) {
          offenders.push(
            `${file}:${d.line} ${block.selector} { ${property}: ${d.value} } has no ${other}: ${d.value}`,
          )
        }
      }
    }
  }
  return offenders
}

/** The boxes a slider or scrub drag starts in, by stylesheet. */
const DRAG_STARTS: readonly (readonly [file: string, selector: string])[] = [
  // The range input everywhere: the sidebar, dialogs, the explorer.
  ['styles/preflight.css', "input[type='range']"],
  // The labelled slider (display: contents, so its children inherit it).
  ['components/Sliders/Slider.module.css', '.label'],
  // Compact mode's scrub label, which holds the value it scrubs.
  ['components/Sliders/ScrubInput.module.css', '.label'],
  // The two-handle range slider.
  ['components/Sliders/RangeSlider.module.css', '.container'],
  // The phone sheet's variation weight rows and colour sliders.
  ['components/TouchSurface/TouchSurface.module.css', '.activeVarRow'],
  ['components/TouchSurface/TouchSurface.module.css', '.colourControlRow'],
  // The Shape sheet's scrub fields: label, value and chevrons.
  ['components/Duel/ScrubField.module.css', '.field'],
]

describe('drag selection on touch', () => {
  it('writes every user-select in both spellings', () => {
    const offenders = readStylesheets().flatMap(({ file, css }) =>
      twinOffenders(css, file),
    )
    expect(offenders).toEqual([])
  })

  it.each(DRAG_STARTS)(
    'turns off selection and the callout where a drag starts: %s %s',
    (file, selector) => {
      const declared = declarationsFor(readCss(file), selector)
      expect(declared).toMatch(/^-webkit-user-select: none;$/m)
      expect(declared).toMatch(/^user-select: none;$/m)
      expect(declared).toMatch(/^-webkit-touch-callout: none;$/m)
    },
  )

  it('keeps every field that takes typing selectable', () => {
    const preflight = readCss('styles/preflight.css')
    const fields = blocksOf(preflight).find((block) =>
      /^:where\(\s*input:not\(/.test(block.selector.trim()),
    )
    const selector = fields?.selector.replace(/\s+/g, ' ') ?? ''
    expect(selector).toContain('textarea')
    // The range input is not a field: it keeps the rule above.
    expect(selector).toContain("[type='range']")
    const declared = new Map(
      fields?.declarations.map((d) => [d.property, d.value]),
    )
    expect(declared.get(PREFIXED)).toBe('text')
    expect(declared.get(STANDARD)).toBe('text')

    const scrubField = declarationsFor(
      readCss('components/Sliders/ScrubInput.module.css'),
      '.input',
    )
    expect(scrubField).toMatch(/^-webkit-user-select: text;$/m)
    expect(scrubField).toMatch(/^user-select: text;$/m)
  })
})
