/**
 * Two guards on backdrop-filter across the app (docs/plans/glass-panels.md,
 * section 3). A blur costs the compositor on every frame the canvas
 * presents, so where the blurs are, and how they are spelled, matters.
 *
 * A RATCHET ON LITERAL BLURS. A surface takes its glass from
 * glass.module.css. A blur a module writes itself is glass that nothing
 * flattens when it nests, that busy never turns solid and that the
 * fallback never reaches; a literal `blur(8px)` escapes Reduce Transparency
 * as well. That holds for var(--la-glass-blur) too, so the token counts
 * like any other value. Their count may only go down, and is pinned
 * exactly, as
 * mainWorkspaceSize.test.ts pins its line count:
 *
 *   - more than MAX_LITERAL_BLURS fails: compose the primitive instead;
 *   - fewer fails too, until MAX_LITERAL_BLURS is lowered to the new count
 *     in the same change, so the slack cannot be spent again unnoticed.
 *
 * Counted: the backdrop-filter declarations in packages/app/src/**\/*.css,
 * outside glass.module.css and lumen.css, whose value is not `none`. Inline
 * styles in TSX are not counted.
 *
 * A -WEBKIT- TWIN FOR EVERY BLUR. iOS Safari before 18 reads only
 * -webkit-backdrop-filter, so a rule that writes the standard spelling alone
 * shows it no glass. Every backdrop-filter, in any stylesheet or inline
 * style object, needs a -webkit-backdrop-filter with the same value in the
 * same rule or object, and every -webkit- one needs its standard twin.
 *
 * -WEBKIT- FIRST. The build's minifier keeps only the later of the two
 * spellings in a rule (LightningCSS, which build.target 'esnext' gives no
 * browser targets). A rule written standard first ships the -webkit- one
 * alone, which Chrome, Firefox and Android do not read: until this guard,
 * that was every glass surface in production. So a stylesheet writes the
 * -webkit- spelling first and the standard one after it. Only iOS before
 * 18 then goes without the blur, and it has no WebGPU to run the editor.
 * Inline styles are set property by property at run time, never minified,
 * so their order is free.
 */
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blocksOf, filesUnder, readStylesheets, SRC } from '@/test/cssModule'
import type { Declaration } from '@/test/cssModule'

/** The literal blurs in the app's stylesheets today. Only ever lower it. */
const MAX_LITERAL_BLURS = 17

/** Where the glass is defined rather than used: exempt from the ratchet. */
const GLASS_SOURCES = new Set([
  'styles/designSystem/glass.module.css',
  'styles/designSystem/lumen.css',
])

const STANDARD = 'backdrop-filter'
const PREFIXED = '-webkit-backdrop-filter'

/** Each blur in a stylesheet whose other spelling is missing from its rule. */
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

/** Each blur in a stylesheet written before its -webkit- twin. */
function orderOffenders(css: string, file: string): string[] {
  const offenders: string[] = []
  for (const block of blocksOf(css)) {
    block.declarations.forEach((d, i) => {
      if (d.property !== STANDARD) return
      const twin = block.declarations.findIndex(
        (t) => t.property === PREFIXED && t.value === d.value,
      )
      if (twin > i) {
        offenders.push(
          `${file}:${d.line} ${block.selector} { ${STANDARD}: ${d.value} } comes before its ${PREFIXED}`,
        )
      }
    })
  }
  return offenders
}

/** The backdrop-filter declarations that write a blur of their own. */
function literalBlurs(css: string): Declaration[] {
  return blocksOf(css)
    .flatMap((block) => block.declarations)
    .filter((d) => d.property === STANDARD && d.value !== 'none')
}

/**
 * The text of the innermost `{ ... }` around `index`, which in a style
 * attribute is the style object. Template literal `${}` inside it balances,
 * so plain brace counting is enough.
 */
function enclosingObject(source: string, index: number): string {
  let depth = 0
  let start = index
  while (start > 0) {
    start--
    if (source[start] === '}') depth++
    else if (source[start] === '{' && depth-- === 0) break
  }
  depth = 0
  let end = start
  while (end < source.length - 1) {
    end++
    if (source[end] === '{') depth++
    else if (source[end] === '}' && depth-- === 0) break
  }
  return source.slice(start, end + 1)
}

/**
 * The blurs set in inline style objects. Solid takes style keys as CSS
 * property names, so these are the quoted kebab-case keys; a value is the
 * expression up to the next comma, brace or line end, compared as written.
 */
function inlineBlurs(text: string) {
  return [
    ...text.matchAll(/(['"])(-webkit-)?backdrop-filter\1\s*:\s*([^,}\n]+)/g),
  ].map((match) => ({
    property: match[2] ? PREFIXED : STANDARD,
    value: match[3]!.trim(),
    index: match.index,
  }))
}

/** Each inline blur whose other spelling is missing from its style object. */
function inlineTwinOffenders(source: string, file: string): string[] {
  const offenders: string[] = []
  for (const blur of inlineBlurs(source)) {
    const other = blur.property === STANDARD ? PREFIXED : STANDARD
    const object = inlineBlurs(enclosingObject(source, blur.index))
    if (!object.some((t) => t.property === other && t.value === blur.value)) {
      const line = source.slice(0, blur.index).split('\n').length
      offenders.push(
        `${file}:${line} '${blur.property}': ${blur.value} has no '${other}': ${blur.value}`,
      )
    }
  }
  return offenders
}

const stylesheets = readStylesheets()

const sources = filesUnder(
  SRC,
  (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name),
).map((full) => ({
  file: relative(SRC, full).split('\\').join('/'),
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a source file filesUnder listed, in this repo
  source: readFileSync(full, 'utf8'),
}))

const literalCount = stylesheets
  .filter(({ file }) => !GLASS_SOURCES.has(file))
  .reduce((count, { css }) => count + literalBlurs(css).length, 0)

describe('literal blurs in the stylesheets', () => {
  it('have not grown past their ratchet', () => {
    expect(
      literalCount,
      `${literalCount} backdrop-filter declarations write a blur of their ` +
        `own, over the ratchet of ${MAX_LITERAL_BLURS}. Compose chrome, panel, ` +
        'flat, or frost for a label over a preview, from ' +
        "'@/styles/designSystem/glass.module.css' instead.",
    ).toBeLessThanOrEqual(MAX_LITERAL_BLURS)
  })

  it('have their ratchet lowered when they go', () => {
    expect(
      literalCount,
      `Literal blurs fell to ${literalCount}. Lower MAX_LITERAL_BLURS in ` +
        `glassBlurs.test.ts from ${MAX_LITERAL_BLURS} to ${literalCount} in ` +
        'this change, so the slack cannot be spent again.',
    ).toBeGreaterThanOrEqual(MAX_LITERAL_BLURS)
  })
})

describe('every blur', () => {
  it('has its -webkit- twin with the same value in the same rule', () => {
    expect(
      stylesheets.flatMap(({ file, css }) => twinOffenders(css, file)),
    ).toEqual([])
  })

  it('comes after its -webkit- twin, so the build keeps it', () => {
    expect(
      stylesheets.flatMap(({ file, css }) => orderOffenders(css, file)),
    ).toEqual([])
  })

  it('has its -webkit- twin in the same inline style object', () => {
    expect(
      sources.flatMap(({ file, source }) => inlineTwinOffenders(source, file)),
    ).toEqual([])
  })

  it('is found in the stylesheets, and the TSX is read at all', () => {
    // Both walks returning nothing would pass the two tests above.
    const pairs = stylesheets.flatMap(({ css }) =>
      blocksOf(css).flatMap((b) => b.declarations),
    )
    expect(pairs.filter((d) => d.property === STANDARD).length).toBeGreaterThan(
      MAX_LITERAL_BLURS,
    )
    // The last inline blur went with the tour's scrims (glass-panels.md,
    // phase 1), so the inline check holds nothing today; the detector is
    // proved on a fixture below. The walk must still reach the TSX.
    expect(
      sources.filter(({ file }) => file.endsWith('.tsx')).length,
    ).toBeGreaterThan(0)
  })
})

describe('the blur detector', () => {
  it('reads each rule on its own, as the browser does', () => {
    const css = `
      /* .ghost { backdrop-filter: blur(1px); } */
      .paired { backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px) }
      .split {
        -webkit-backdrop-filter: blur(3px);
        &:hover { backdrop-filter: blur(3px); }
      }
      .differs { -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(5px); }
      @supports (not (backdrop-filter: blur(1px))) {
        .quoted { background: url('a;{b}.png'); backdrop-filter: none; }
      }
    `
    expect(twinOffenders(css, 'x.css')).toEqual([
      'x.css:5 .split { -webkit-backdrop-filter: blur(3px) } has no backdrop-filter: blur(3px)',
      'x.css:6 &:hover { backdrop-filter: blur(3px) } has no -webkit-backdrop-filter: blur(3px)',
      'x.css:8 .differs { backdrop-filter: blur(5px) } has no -webkit-backdrop-filter: blur(5px)',
      'x.css:8 .differs { -webkit-backdrop-filter: blur(4px) } has no backdrop-filter: blur(4px)',
      'x.css:10 .quoted { backdrop-filter: none } has no -webkit-backdrop-filter: none',
    ])
  })

  it('finds a blur written before its -webkit- twin', () => {
    const css = `
      .late { backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px) }
      .first { -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px) }
      .other {
        -webkit-backdrop-filter: none;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }
      .nested {
        -webkit-backdrop-filter: none;
        &:hover { backdrop-filter: none; }
      }
    `
    expect(orderOffenders(css, 'x.css')).toEqual([
      'x.css:2 .late { backdrop-filter: blur(2px) } comes before its -webkit-backdrop-filter',
      'x.css:6 .other { backdrop-filter: blur(4px) } comes before its -webkit-backdrop-filter',
    ])
  })

  it('counts every blur a stylesheet writes, the glass token too', () => {
    const css = `
      .a { backdrop-filter: blur(8px) saturate(1.2); }
      .b { backdrop-filter: none; }
      .c { backdrop-filter: var(--la-glass-blur); }
      .d { backdrop-filter: var(--la-glass-blur, blur(4px)); }
      .e { -webkit-backdrop-filter: blur(8px); }
    `
    expect(literalBlurs(css).map((d) => d.value)).toEqual([
      'blur(8px) saturate(1.2)',
      'var(--la-glass-blur)',
      'var(--la-glass-blur, blur(4px))',
    ])
  })

  it('finds an inline blur without its twin', () => {
    const source = `
      const a = <div style={{ 'backdrop-filter': blur, '-webkit-backdrop-filter': blur }} />
      const b = <div style={{
        top: \`\${rect().y}px\`,
        'backdrop-filter': blur,
      }} />
      const c = <div style={{ '-webkit-backdrop-filter': other, 'backdrop-filter': blur }} />
    `
    expect(inlineTwinOffenders(source, 'x.tsx')).toEqual([
      "x.tsx:5 'backdrop-filter': blur has no '-webkit-backdrop-filter': blur",
      "x.tsx:7 '-webkit-backdrop-filter': other has no 'backdrop-filter': other",
      "x.tsx:7 'backdrop-filter': blur has no '-webkit-backdrop-filter': blur",
    ])
  })
})
