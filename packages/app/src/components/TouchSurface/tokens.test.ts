import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The touch surfaces read the --la-* tokens; a hex literal here is a colour
// that will not follow the direction switch (docs/plans/mobile-native/DESIGN.md).
// The shell is chrome of the same kind, so it is held to the same rule.
const DIRS = [__dirname, join(__dirname, '..', 'Shell')]

/**
 * Declarations that animate with the bare `la-surface-enter` name. A CSS
 * module rewrites that to a name scoped to its own file while the keyframe
 * itself is global (lumen.css), so the two never meet and the animation
 * silently never runs; `global(...)` is the escape the same plugin honours.
 *
 * The value ends at the first `;` or `}`. Requiring the semicolon meant a
 * declaration written last in its block - legal CSS, and what the formatter
 * leaves alone - was never scanned at all.
 */
function scopedEnterOffenders(css: string, file: string): string[] {
  const offenders: string[] = []
  for (const match of css.matchAll(
    /animation(?:-name)?:([^;}]*la-surface-enter[^;}]*)/g,
  )) {
    const value = match[1]!
    if (!/global\(\s*la-surface-enter\s*\)/.test(value)) {
      offenders.push(`${file}: ${value.trim()}`)
    }
  }
  return offenders
}

describe('touch surface stylesheets', () => {
  it('carry no hex colour literals', () => {
    const offenders: string[] = []
    for (const dir of DIRS) {
      for (const file of readdirSync(dir).filter((f) =>
        f.endsWith('.module.css'),
      )) {
        const css = readFileSync(join(dir, file), 'utf8')
        for (const match of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g))
          offenders.push(`${file}: ${match[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('reaches the global surface-enter keyframe rather than a scoped name', () => {
    // The cross-fade at the rail-or-deck threshold ran against a name that
    // did not exist, so it silently never played.
    const offenders: string[] = []
    for (const dir of DIRS) {
      for (const file of readdirSync(dir).filter((f) =>
        f.endsWith('.module.css'),
      )) {
        offenders.push(
          ...scopedEnterOffenders(readFileSync(join(dir, file), 'utf8'), file),
        )
      }
    }
    expect(offenders).toEqual([])
  })

  it('scans a declaration that ends its block without a semicolon', () => {
    // The guard required the trailing `;`, so the one spelling that is both
    // legal and left alone by the formatter - last declaration in the block -
    // was never scanned, and the bug it exists to catch walked past it.
    expect(
      scopedEnterOffenders(
        '.rail { animation: la-surface-enter 120ms }',
        'sample.css',
      ),
    ).toEqual(['sample.css: la-surface-enter 120ms'])
    expect(
      scopedEnterOffenders(
        '.rail { animation: global(la-surface-enter) 120ms }',
        'sample.css',
      ),
    ).toEqual([])
  })
})
