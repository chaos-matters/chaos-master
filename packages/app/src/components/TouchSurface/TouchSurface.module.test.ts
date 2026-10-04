/**
 * The touch inspector's controls and text as its stylesheet writes them,
 * which the test DOM does not apply (TouchSurface.module.css; the text tiers
 * are docs/plans/glass-panels.md, decision c).
 *
 * - Every control fills with a control token (lumen.css): the hairline wash
 *   it always had on an opaque surface, and an opaque fill of its own where
 *   the floating tablet deck sets one (TabletDeck.module.css). Its edge
 *   keeps the hairline, so on the deck the edge and the fill are two colours.
 * - With the Glass panels setting on, no text is accent: the search toggle,
 *   the selected tab and the Randomize button take ink, and the tab and the
 *   button keep the accent in their fill and edge.
 * - On glass the variation gallery's scrollbar takes an ink it holds 3:1
 *   with, where its hairline thumb was about the glass's own colour.
 * - On glass the scrub fields (Duel/ScrubField.module.css) take this
 *   surface's tokens through the hooks they read.
 *
 * Read from disk rather than imported: the test runtime turns a CSS module
 * import into class names. So it is registered in scripts/always-on-tests.mjs.
 */
import { describe, expect, it } from 'vitest'
import { blocksOf, hookReads, readCss } from '@/test/cssModule'

const css = readCss('components/TouchSurface/TouchSurface.module.css')
const scrub = readCss('components/Duel/ScrubField.module.css')

const GLASS_ON = ":global(:root[data-glass-panels='on'])"

/**
 * Every rule of a stylesheet as [selector, declarations]: its selector list
 * with nesting resolved, and its own declarations as `property: value;`.
 */
function rules(sheet: string): [string, string][] {
  return blocksOf(sheet)
    .filter((block) => block.selectors.length > 0)
    .map((block) => [
      block.selectors.join(', '),
      block.declarations.map((d) => `${d.property}: ${d.value};`).join(' '),
    ])
}

/** The declarations of the rule written exactly as `selector`. */
function rule(sheet: string, selector: string): string {
  return rules(sheet).find(([sel]) => sel === selector)?.[1] ?? ''
}

/** The value `property` takes in a block of declarations. */
function value(block: string, property: string): string | undefined {
  const escaped = property.replace(/[-]/g, '\\-')
  // eslint-disable-next-line security/detect-non-literal-regexp -- a property name this test writes
  return new RegExp(`(?:^|;)\\s*${escaped}:\\s*([^;]+)`)
    .exec(block)?.[1]
    ?.trim()
}

/** The controls the inspector draws, each with its fill. */
const CONTROLS = {
  '.transformPill': 'var(--la-control)',
  '.iconBtnSmall': 'var(--la-control)',
  '.iconBtnSmall:hover:not(:disabled)': 'var(--la-control-strong)',
  '.tabChip': 'var(--la-control)',
  '.tabChipActive': 'var(--la-control-accent)',
  '.activeVarRow': 'var(--la-control)',
  '.quickPickCard': 'var(--la-control)',
  '.quickPickCard:hover': 'var(--la-control)',
  '.resetShapeBtn': 'var(--la-control)',
  '.resetShapeBtn:hover': 'var(--la-control-strong)',
  '.actionPillBtn': 'var(--la-control)',
  '.actionPillBtn:hover': 'var(--la-control-strong)',
  '.actionPillBtnPrimary': 'var(--la-control-accent)',
  '.actionPillBtnPrimary:hover': 'var(--la-control-accent)',
  '.searchToggleBtn:hover, .searchToggleBtn:active': 'var(--la-control-accent)',
}

/**
 * Fills that stay washes: the tools drawer's cards, on a glass panel of
 * their own outside the deck (MainWorkspace mounts the drawer), and the
 * WebKit scrollbar's thumb, which is not a control's fill.
 */
const WASH_FILLS_ALLOWED = [
  '.drawerCard',
  '.drawerCardHighlight',
  '.drawerCardHighlight:hover',
  '.variationsCarousel::-webkit-scrollbar-thumb',
]

describe('the touch inspector stylesheet', () => {
  it('fills every control with a control token', () => {
    const wrong = Object.entries(CONTROLS).flatMap(([selector, fill]) => {
      const found = value(rule(css, selector), 'background')
      return found === fill ? [] : [`${selector} fills with ${found}`]
    })
    expect(wrong).toEqual([])
  })

  it('edges the controls with a hairline, apart from their fill', () => {
    for (const selector of [
      '.transformPill',
      '.iconBtnSmall',
      '.tabChip',
      '.activeVarRow',
      '.quickPickCard',
      '.resetShapeBtn',
      '.actionPillBtn',
    ]) {
      expect(value(rule(css, selector), 'border'), selector).toMatch(
        /^1px solid var\(--la-hairline(-strong)?\)$/,
      )
    }
  })

  it('fills nothing else with a hairline or the accent wash', () => {
    // A new control filled with the hairline would be the colour of its own
    // edge on the floating deck, where the control tokens are opaque.
    const strays = rules(css)
      .filter(([selector]) => !WASH_FILLS_ALLOWED.includes(selector))
      .filter(([, body]) =>
        /--la-(hairline|accent-wash)/.test(value(body, 'background') ?? ''),
      )
      .map(([selector]) => selector)
    expect(strays).toEqual([])
  })

  it('writes the selected tab and the Randomize button in ink on glass', () => {
    // Accent text falls to 3.85:1 on 80% glass over white-hot art. The
    // glass rule also outranks the button's own :hover colour: it adds
    // :root and an attribute to a class.
    const inked = rules(css)
      .filter(([selector]) => selector.startsWith(GLASS_ON))
      .filter(([, body]) => value(body, 'color') === 'var(--la-ink)')
      .map(([selector]) => selector)
      .join(' ')
    for (const name of [
      'searchToggleBtn',
      'tabChipActive',
      'actionPillBtnPrimary',
    ]) {
      // eslint-disable-next-line security/detect-non-literal-regexp -- a class name from the list above
      expect(inked, name).toMatch(new RegExp(`\\.${name}(?![\\w-])`))
    }
    // The accent stays in the fill and the edge.
    expect(value(rule(css, '.tabChipActive'), 'border-color')).toBe(
      'var(--la-accent-edge)',
    )
    expect(value(rule(css, '.actionPillBtnPrimary'), 'border-color')).toBe(
      'var(--la-accent-edge)',
    )
  })

  it('draws the gallery scrollbar in ink-3 on glass, the hairline elsewhere', () => {
    // Chrome draws the thumb from scrollbar-color, Safari from the WebKit
    // thumb. Glass maps ink-3 to ink-2 (glass.module.css, .panel).
    expect(value(rule(css, '.variationsCarousel'), 'scrollbar-color')).toBe(
      'var(--la-hairline-strong) transparent',
    )
    expect(
      value(rule(css, `${GLASS_ON} .variationsCarousel`), 'scrollbar-color'),
    ).toBe('var(--la-ink-3) transparent')
    expect(
      value(
        rule(css, `${GLASS_ON} .variationsCarousel::-webkit-scrollbar-thumb`),
        'background',
      ),
    ).toBe('var(--la-ink-3)')
  })
})

describe('the scrub fields on the touch inspector', () => {
  const reads = hookReads(scrub, ['scrub']).map(({ name, fallback }) => ({
    hook: name,
    fallback,
  }))
  const set = new Map(
    [
      ...rule(css, `${GLASS_ON} .shapeFieldsGrid`).matchAll(
        /(--scrub-[\w-]+):\s*([^;]+)/g,
      ),
    ].map(([, hook, setTo]) => [hook!, setTo!.trim()]),
  )

  it('keep the look they have on the Duel wherever a hook is unset', () => {
    expect(reads.length).toBeGreaterThan(0)
    expect(reads.filter(({ fallback }) => !fallback)).toEqual([])
    // No literal white is left outside a fallback.
    // eslint-disable-next-line security/detect-unsafe-regex -- [^()] and a parenthesis never overlap, so it cannot backtrack
    const bare = scrub.replace(/var\([^()]*(\([^()]*\)[^()]*)*\)/g, '')
    expect(bare).not.toMatch(/rgba\(255, 255, 255/)
  })

  it('are handed every hook they read on glass, as tokens', () => {
    expect([...set.keys()].sort()).toEqual(
      [...new Set(reads.map(({ hook }) => hook))].sort(),
    )
    const wrong = [...set].filter(
      ([hook, setTo]) =>
        !/^var\(--la-[\w-]+\)$/.test(setTo) &&
        !(hook === '--scrub-unit-opacity' && setTo === '1'),
    )
    expect(wrong).toEqual([])
  })

  it('write their text in ink on glass', () => {
    // Their label, white at 58% over the floating deck's glass, measured
    // 4.43:1 over bright art.
    expect(set.get('--scrub-label')).toBe('var(--la-ink)')
    expect(set.get('--scrub-value')).toBe('var(--la-ink)')
    expect(set.get('--scrub-unit-opacity')).toBe('1')
  })
})
