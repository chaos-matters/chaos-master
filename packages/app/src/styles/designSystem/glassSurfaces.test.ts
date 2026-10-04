/**
 * Where the app's glass is written (docs/plans/glass-panels.md, section 3).
 * glass.module.css and lumen.css are the one place a surface's glass is
 * decided, so that changing a fill, a blur or the setting's gate changes
 * every surface at once. These guards keep it that way:
 *
 *   - The literal blurs left are App.module.css's and the arena's and the
 *     duel's, which keep their own look on purpose and say so on the line
 *     above each. glassBlurs.test.ts counts them; this says where they may
 *     be, so that one cannot be swapped for a new one elsewhere.
 *   - The large desktop surfaces over the canvas compose optionalPanel, so
 *     the Glass panels setting, busy and the text tiers reach each of them;
 *     the labels over previews compose frost or frostFade, the screens that
 *     block the app compose scrim.
 *   - No stylesheet but lumen.css defines a glass, frost or scrim token, and
 *     the ink remap a panel carries is written outside glass.module.css only
 *     where the glass sits on another element than the text.
 *   - The hooks the shared components read on glass are set by onGlass
 *     alone (glassHooks.test.ts holds it to them), so the surfaces that hold
 *     those components compose it rather than keep a copy of its values.
 *   - A glass surface that keeps a light fill of its own sets the theme's
 *     focus ring in the rule that sets that fill, and the glass ring again
 *     in each rule that turns it back to glass (glass.module.css says why).
 *
 * Read from disk rather than imported: the test runtime turns a CSS module
 * import into class names. So it is registered in scripts/always-on-tests.mjs.
 */
import { describe, expect, it } from 'vitest'
import { blocksOf, escapeRegExp, readStylesheets, subjectOf, } from '@/test/cssModule'

const GLASS = "'@/styles/designSystem/glass.module.css'"

const stylesheets = readStylesheets()

const DEFINED_HERE = new Set([
  'styles/designSystem/glass.module.css',
  'styles/designSystem/lumen.css',
])

/**
 * The line numbers of the blurs a stylesheet writes itself, the glass
 * token among them: a surface takes that blur by composing the primitive.
 */
function literalBlurLines(css: string): number[] {
  return css.split('\n').flatMap((line, i) =>
    // The space sits inside the lookahead, or it would give back the one
    // before `none` and pass it.
    /^\s*backdrop-filter:(?!\s*none\s*;)/.test(line) ? [i + 1] : [],
  )
}

/** Whether a compound carries the class `name`, other than in a :not(). */
function hasClass(compound: string, name: string): boolean {
  const escaped = escapeRegExp(name)
  // eslint-disable-next-line security/detect-non-literal-regexp -- a class name, escaped
  return new RegExp(`\\.${escaped}(?![\\w-])`).test(
    compound.replace(/:not\([^)]*\)/g, ''),
  )
}

/** A compound in no state: `.a:not(.b)`, but not `.a:hover`. */
const atRest = (compound: string) =>
  !compound.replace(/:not\([^)]*\)/g, '').includes(':')

/**
 * Every declaration of `properties` in the rules that style the class
 * `name`, in any state, theme or nesting.
 */
function declarationsFor(css: string, name: string, properties: RegExp) {
  return blocksOf(css).flatMap((block) => {
    const subjects = block.selectors
      .map(subjectOf)
      .filter((compound) => hasClass(compound, name))
    if (!subjects.length) return []
    return block.declarations
      .filter((d) => properties.test(d.property))
      .map((d) => ({ ...d, block, atRest: subjects.some(atRest) }))
  })
}

/**
 * Whether `selector`'s own rule composes `primitive` from glass.module.css,
 * alone or beside others on the same line.
 */
function composes(css: string, selector: string, primitive: string): boolean {
  const escaped = escapeRegExp(selector)
  // eslint-disable-next-line security/detect-non-literal-regexp -- a selector, escaped
  return new RegExp(
    `(^|\\n)${escaped} \\{\\s*composes: (?:\\w+ )*${primitive}(?: \\w+)* from ${GLASS};`,
  ).test(css)
}

function stylesheet(file: string) {
  const found = stylesheets.find((s) => s.file === file)
  if (!found) throw new Error(`${file} is not a stylesheet under src`)
  return found
}

/** Deliberate exceptions: each blur there says so on the line above it. */
const OWN_GLASS = [
  'components/ArenaOverlay.module.css',
  'components/Duel/DuelChips.module.css',
  'components/Duel/DuelResultCard.module.css',
  'components/Duel/DuelStage.module.css',
  'components/Duel/EclipseHud.module.css',
]

describe('literal blurs', () => {
  it('are only in App.module.css and the arena and duel stylesheets', () => {
    const allowed = new Set(['App.module.css', ...OWN_GLASS])
    const elsewhere = stylesheets
      .filter(({ file }) => !DEFINED_HERE.has(file) && !allowed.has(file))
      .flatMap(({ file, css }) =>
        literalBlurLines(css).map((line) => `${file}:${line}`),
      )
    expect(elsewhere).toEqual([])
  })

  it('in the arena and the duel, each say why they are literal', () => {
    const unmarked = OWN_GLASS.flatMap((file) => {
      const { raw, css } = stylesheet(file)
      const lines = raw.split('\n')
      return literalBlurLines(css).flatMap((line) => {
        // The comment sits above the -webkit- twin, which comes first.
        const above = lines[line - 3] ?? ''
        return above.includes('Literal on purpose') ? [] : [`${file}:${line}`]
      })
    })
    expect(unmarked).toEqual([])
    expect(
      OWN_GLASS.every((file) => literalBlurLines(stylesheet(file).css).length),
    ).toBe(true)
  })
})

/** Each surface that takes its glass from a primitive, by the rule it is in. */
const SURFACES: [primitive: string, file: string, selector: string][] = [
  ['optionalPanel', 'App.module.css', '.sidebarGlass'],
  ['onGlass', 'App.module.css', '.sidebarGlass'],
  ['panel', 'pages/FractalExplorer/FractalExplorerPage.module.css', '.panel'],
  ['onGlass', 'pages/FractalExplorer/FractalExplorerPage.module.css', '.panel'],
  [
    'optionalPanel',
    'components/FloatingActions/FloatingActions.module.css',
    '.widget',
  ],
  ['optionalPanel', 'components/PullUpMenu/PullUpMenu.module.css', '.panel'],
  [
    'optionalPanel',
    'components/SoftwareVersion/SoftwareVersion.module.css',
    '.menuPopoverUp',
  ],
  [
    'optionalPanel',
    'components/SessionRecorder/SessionRecorderDock.module.css',
    '.bar',
  ],
  [
    'optionalPanel',
    'components/SessionRecorder/SessionLibraryPanel.module.css',
    '.panel',
  ],
  [
    'optionalPanel',
    'components/SessionRecorder/SessionReplayPanel.module.css',
    '.panel',
  ],
  [
    'optionalPanel',
    'components/SessionRecorder/ReplayAgentRail.module.css',
    '.rail',
  ],
  [
    'chrome',
    'components/SoftwareVersion/SoftwareVersion.module.css',
    '.desktopTrigger',
  ],
  ['chrome', 'components/Arcade/PilotOverlay.module.css', '.banner'],
  ['chrome', 'components/Arcade/PilotOverlay.module.css', '.hint'],
  [
    'chrome',
    'components/SessionRecorder/ReplaySpotlight.module.css',
    '.caption',
  ],
  ['chrome', 'pages/Benchmarks/BenchmarksPage.module.css', '.header'],
  [
    'frostFade',
    'components/BlendFlameGallery/BlendFlameGallery.module.css',
    '.thumbnailBar',
  ],
  [
    'frostFade',
    'components/LoadFlameModal/LoadFlameModal.module.css',
    '.item-title',
  ],
  [
    'frostFade',
    'components/WelcomeScreen/WelcomeScreen.module.css',
    '.thumbnailBar',
  ],
  [
    'frost',
    'components/ExportPngDialog/FramePreviewGallery.module.css',
    '.frameNumber',
  ],
  ['frost', 'components/DirectorOverlay.module.css', '.fitnessBadge'],
  ['frost', 'components/Home/HomeTab.module.css', '.plate-link'],
  ['frost', 'components/FlameColorEditor/ColorEditor.module.css', '.tabs'],
  ['scrim', 'components/WelcomeScreen/WelcomeScreen.module.css', '.backdrop'],
  [
    'scrim',
    'components/ErrorHandling/ErrorHandling.module.css',
    '.crash-overlay',
  ],
]

describe('the surfaces that take their glass from a primitive', () => {
  it.each(SURFACES)('%s: %s %s', (primitive, file, selector) => {
    expect(composes(stylesheet(file).css, selector, primitive)).toBe(true)
  })

  it('fade their fill when busy turns a panel solid', () => {
    // glass.module.css sets no transition on optionalPanel. A surface with
    // none snaps between the glass and the solid fill mid-playback, and so
    // does one with any rule, in any state or theme, whose transition
    // leaves background-color out.
    const snapping = SURFACES.filter(([p]) => p === 'optionalPanel').flatMap(
      ([, file, selector]) => {
        const lists = declarationsFor(
          stylesheet(file).css,
          selector.slice(1),
          /^transition(-property)?$/,
        )
        const fades = (value: string) => /background-color|\ball\b/.test(value)
        const short = lists
          .filter((d) => !fades(d.value))
          .map((d) => `${file}:${d.line} ${selector} ${d.property}: ${d.value}`)
        return lists.some((d) => d.atRest && fades(d.value))
          ? short
          : [
              `${file} ${selector} has no transition on background-color`,
              ...short,
            ]
      },
    )
    expect(snapping).toEqual([])
  })

  it('fade their fill by every rule, which the reader finds', () => {
    const css = `.a {\n  transition: background-color 1s;\n  &:hover { transition: transform 1s; }\n}\n[data-theme='dark'] .a:not(.b) { transition: all 1s; }\n.ab { transition: none; }\n.c .a-b { transition: none; }\n`
    expect(
      declarationsFor(css, 'a', /^transition$/).map((d) => [
        d.line,
        d.value,
        d.atRest,
      ]),
    ).toEqual([
      [2, 'background-color 1s', true],
      [3, 'transform 1s', false],
      [5, 'all 1s', true],
    ])
  })

  it('are found by the matcher, which misses a rule that does not compose', () => {
    const css = `.a {\n  composes: frost from ${GLASS};\n}\n.b {\n  color: red;\n}\n.c {\n  composes: optionalPanel onGlass from ${GLASS};\n}\n`
    expect(composes(css, '.a', 'frost')).toBe(true)
    expect(composes(css, '.b', 'frost')).toBe(false)
    expect(composes(css, '.a', 'scrim')).toBe(false)
    expect(composes(css, '.a', 'frostFade')).toBe(false)
    expect(composes(css, '.c', 'optionalPanel')).toBe(true)
    expect(composes(css, '.c', 'onGlass')).toBe(true)
    expect(composes(css, '.c', 'panel')).toBe(false)
  })
})

describe('the glass tokens', () => {
  it('are defined in lumen.css alone', () => {
    const redefined = stylesheets
      .filter(({ file }) => !DEFINED_HERE.has(file))
      .flatMap(({ file, css }) =>
        [
          ...css.matchAll(
            /(?:^|[;{\s])(--la-(?:glass|frost|scrim)[\w-]*)\s*:/g,
          ),
        ].map((m) => `${file}: ${m[1]}`),
      )
    expect(redefined).toEqual([])
  })

  it('leave the ink remap to the primitive, but where the glass is a layer', () => {
    // The tour's card puts its glass on a layer behind the text, and the
    // tablet deck switches its glass by class; each keeps the text contract
    // on the element that holds the text.
    const remaps = stylesheets
      .filter(({ file }) => !DEFINED_HERE.has(file))
      .flatMap(({ file, css }) =>
        /--la-ink-3\s*:\s*var\(--la-ink-2\)/.test(css) ? [file] : [],
      )
    expect(remaps.sort()).toEqual([
      'components/SpotlightTour/SpotlightTour.module.css',
      'components/TouchSurface/TabletDeck.module.css',
    ])
  })
})

describe("the shared components' glass hooks", () => {
  it('are set by onGlass alone', () => {
    const copies = stylesheets
      .filter(({ file }) => file !== 'styles/designSystem/glass.module.css')
      .flatMap(({ file, css }) =>
        [
          ...css.matchAll(
            /(?:^|[;{\s])(--(?:card|slider|palette)-[\w-]*)\s*:/g,
          ),
        ].map((m) => `${file}: ${m[1]}`),
      )
    expect(copies).toEqual([])
  })
})

const THEME_RING = 'var(--focus-ring-theme)'
const GLASS_RING = 'var(--focus-ring-glass)'

/** The classes whose own rule composes one of the four glass classes. */
function glassComposers(css: string): string[] {
  return [
    ...css.matchAll(
      new RegExp(
        `(?:^|\\n)\\.([\\w-]+) \\{\\s*composes: ([\\w ]+) from ${GLASS};`,
        'g',
      ),
    ),
  ]
    .filter((m) => /\b(?:chrome|panel|flat|solid)\b/.test(m[2]!))
    .map((m) => m[1]!)
}

/**
 * Whether a fill is light: a ring on it needs the theme's colour, which
 * holds 3:1 there, where the glass ring does not. A light colour over half
 * opaque, or one of the light neutrals.
 */
function isLightFill(value: string): boolean {
  const opaque = (alpha = '1') =>
    parseFloat(alpha) / (alpha.endsWith('%') ? 100 : 1) >= 0.5
  const colour = /^(oklch|rgba?)\((.*)\)$/.exec(value)
  if (colour) {
    const [channels = '', slashAlpha] = colour[2]!.split('/')
    const [first = '', second = '', third = '', commaAlpha] = channels
      .split(/[\s,]+/)
      .filter(Boolean)
    const alpha = (slashAlpha ?? commaAlpha)?.trim()
    return colour[1] === 'oklch'
      ? parseFloat(first) >= 80 && opaque(alpha)
      : Math.min(+first, +second, +third) >= 200 && opaque(alpha)
  }
  return /#fff\b|#ffffff\b|\bwhite\b|var\(--neutral-(?:50|100|200)\b/i.test(
    value,
  )
}

/**
 * The fills a glass surface sets at rest, for each surface that sets a
 * light one, with the ring each rule states.
 */
function lightFilledSurfaces(css: string) {
  return glassComposers(css).flatMap((name) => {
    const fills = declarationsFor(css, name, /^background(-color)?$/)
      .filter((d) => d.atRest)
      .map((d) => ({
        ...d,
        ring: d.block.declarations.findLast(
          (r) => r.property === '--focus-ring-color',
        )?.value,
      }))
    return fills.some((d) => isLightFill(d.value)) ? [{ name, fills }] : []
  })
}

/** Each rule of those surfaces whose ring does not match its fill. */
function ringOffenders(css: string, file: string): string[] {
  return lightFilledSurfaces(css).flatMap(({ name, fills }) =>
    fills.flatMap((d) => {
      const ring = isLightFill(d.value) ? THEME_RING : GLASS_RING
      return d.ring === ring
        ? []
        : [
            `${file}:${d.line} .${name} background: ${d.value} needs --focus-ring-color: ${ring}`,
          ]
    }),
  )
}

describe('the focus ring on a glass surface', () => {
  it("is the theme's on a light fill, and glass's where the rule turns it back", () => {
    expect(
      stylesheets.flatMap(({ file, css }) => ringOffenders(css, file)),
    ).toEqual([])
  })

  it('is checked on the surfaces that keep a light fill', () => {
    // The walk finding none would pass the test above.
    expect(
      stylesheets.flatMap(({ file, css }) =>
        lightFilledSurfaces(css).map(({ name }) => `${file} .${name}`),
      ),
    ).toEqual([
      'App.module.css .toast',
      'App.module.css .hover-preview-badge',
      'components/SoftwareVersion/SoftwareVersion.module.css .desktopTrigger',
    ])
  })

  it('is found wrong by the matcher, which reads fills at rest alone', () => {
    const css = [
      '.pill {',
      `  composes: chrome from ${GLASS};`,
      '  background: rgba(255, 255, 255, 0.75);',
      '  &:hover { background: white; }',
      "  [data-theme='dark'] & { background: var(--la-glass); }",
      '}',
      '.toast {',
      `  composes: chrome from ${GLASS};`,
      "  [data-theme='light'] &:not(.touch) {",
      '    background: oklch(97% 0.01 240 / 0.92);',
      `    --focus-ring-color: ${THEME_RING};`,
      '  }',
      '}',
      `.dim { composes: chrome from ${GLASS}; background: #0008; }`,
      '.card { background: #fff; }',
      `.menu {\n  composes: optionalPanel from ${GLASS};\n  background: white;\n}`,
    ].join('\n')
    expect(ringOffenders(css, 'x.css')).toEqual([
      `x.css:3 .pill background: rgba(255, 255, 255, 0.75) needs --focus-ring-color: ${THEME_RING}`,
      `x.css:5 .pill background: var(--la-glass) needs --focus-ring-color: ${GLASS_RING}`,
    ])
  })
})
