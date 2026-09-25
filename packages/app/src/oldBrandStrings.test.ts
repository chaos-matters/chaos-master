// Guards against the old brand name coming back into the app's text.
//
// The app was renamed from Chaos Master to Lumen Apeiron in #58, and strings
// the rename missed were still on screen long after, among them the arena
// trophy title and the deep-zoom back link's accessible name. Nothing failed
// when they slipped through, so this walks the app source and fails on any
// "Chaos Master" left in it.
//
// Comments are stripped first: they may name the project's history freely
// (flame/flameXml.ts, shaders/random.ts). Identifiers and storage keys such as
// `chaos-master-recent-flames` or `@chaos-master/core` are all lower-case and
// hyphenated, which the patterns below do not match. They must keep their
// names: renaming a storage key orphans every user's saved data under it.
//
// The check is static and deliberately simple, like moduleScopeComputations.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = import.meta.dirname

/**
 * Occurrences that are meant to be there. Each is matched by file and by a
 * fragment of its line, and each must still be found, so a stale entry fails
 * instead of quietly allowing a new occurrence.
 */
const ALLOWED: ReadonlyArray<{ file: string; line: string; why: string }> = [
  {
    file: 'components/WelcomeScreen/WelcomeScreen.tsx',
    line: 'Chaos Master — create and animate fractal flames',
    why: 'the Welcome subtitle names the old brand on purpose, under the new title (rebrand PR #58)',
  },
  // Found by this guard when it was written, outside the two strings the
  // rename fix was scoped to. Each still shows the old brand; each is here
  // only until its wording is decided, and the entry goes with the fix.
  {
    file: 'components/ErrorHandling/ErrorHandling.tsx',
    line: '<h1 class={ui.webgpuTitle}>CHAOS MASTER</h1>',
    why: 'pending a wording decision: the no-WebGPU fallback screen title',
  },
  {
    file: 'components/ErrorHandling/ErrorHandling.tsx',
    line: '<h1 class={ui.crashTitle}>CHAOS MASTER</h1>',
    why: 'pending a wording decision: the crash screen title',
  },
  {
    file: 'components/ArenaOverlay/championCardCanvas.ts',
    line: "ctx.fillText('CHAOS MASTER • ARENA CHAMPION'",
    why: 'pending a wording decision: the header drawn on the exported champion card PNG',
  },
  {
    file: 'components/DocumentationModal/IfsGuideTab.tsx',
    line: 'fractal attractors from a finite set of contraction mappings. Chaos',
    why: 'pending a wording decision: the IFS guide intro, "Chaos Master evaluates millions of particle trajectories"',
  },
]

/** String and template literals, kept; line and block comments, dropped. */
const LITERAL_OR_COMMENT =
  /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g

/** Blanks comments out, keeping every newline so line numbers still hold. */
const stripComments = (source: string) =>
  source.replace(LITERAL_OR_COMMENT, (match, literal?: string) =>
    literal === undefined ? match.replace(/[^\n]/g, ' ') : match,
  )

/**
 * "Chaos Master" in any case, with any whitespace between the words (JSX text
 * can wrap between them). The hyphenated form counts only with a capital
 * letter in it: all-lower-case `chaos-master` is the identifier form.
 */
const OLD_BRAND = /chaos\s+master|chaos-master/gi
const isOldBrand = (match: string) => match !== 'chaos-master'

function sourceFiles(dir: string, acc: string[] = []): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a directory under src/, in this repo
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- an entry of that directory
    if (statSync(full).isDirectory()) sourceFiles(full, acc)
    else if (/\.tsx?$/.test(name) && !/\.(test|spec|d)\.tsx?$/.test(name))
      acc.push(full)
  }
  return acc
}

type Hit = { file: string; line: number; text: string }

const hits: Hit[] = sourceFiles(SRC).flatMap((full) => {
  const file = relative(SRC, full).split('\\').join('/')
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a file sourceFiles listed
  const source = readFileSync(full, 'utf8')
  const lines = source.split('\n')
  return [...stripComments(source).matchAll(OLD_BRAND)]
    .filter((m) => isOldBrand(m[0]))
    .map((m) => {
      const line = source.slice(0, m.index).split('\n').length
      return { file, line, text: lines[line - 1]!.trim() }
    })
})

const allows = (entry: (typeof ALLOWED)[number], hit: Hit) =>
  entry.file === hit.file && hit.text.includes(entry.line)

describe('the old brand name', () => {
  it('appears nowhere in the app source outside comments', () => {
    const offenders = hits
      .filter((hit) => !ALLOWED.some((entry) => allows(entry, hit)))
      .map((hit) => `${hit.file}:${hit.line}: ${hit.text}`)
    expect(offenders).toEqual([])
  })

  it('still appears at each allowed place, once', () => {
    const counts = ALLOWED.map(
      (entry) =>
        `${entry.file}: ${hits.filter((hit) => allows(entry, hit)).length}`,
    )
    expect(counts).toEqual(ALLOWED.map((entry) => `${entry.file}: 1`))
  })
})
