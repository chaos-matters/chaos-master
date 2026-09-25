// Guards the always-on test list in scripts/always-on-tests.mjs.
//
// `pnpm test:pr` / `pnpm test:changed` run the app suite scoped to what a
// branch touched (a local tool since 2026-09-24; CI runs the full suite), and
// that scoping works off vitest's module graph. A test that reaches its
// subject through the filesystem -- readFileSync, readdirSync,
// import.meta.glob -- has no edge in that graph, so it is only ever selected
// by being named on the always-on list.
//
// Which makes the list the weak point. Nothing stops the next such test from
// being written and quietly never running in a scoped run; that is exactly
// how the Playwright specs outside the smoke subset rotted (see
// docs/agent/TESTING.md section 4), and a green tick that tests nothing is
// worse than no tick.
//
// So the list polices itself. This walks every app test file, flags the ones
// of that genre, and fails unless each is on ALWAYS_ON or on EXEMPT with a
// written reason. It checks the other direction too: every ALWAYS_ON entry
// marked `genre: 'filesystem'` must still be flagged, so weakening the
// detector turns this red instead of silent.
//
// This test reads the tree itself, which is why it is on the list it guards.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALWAYS_ON, EXEMPT } from '../../../scripts/always-on-tests.mjs'

const APP = join(import.meta.dirname, '..')

/**
 * How a test reaches the tree without an import. Broad on purpose: a false
 * positive costs one EXEMPT entry with a reason, a false negative costs a
 * test that silently stops running.
 */
const GENRE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\breadFileSync\s*\(/, 'readFileSync'],
  [/\breaddirSync\s*\(/, 'readdirSync'],
  [/\bglobSync\s*\(/, 'globSync'],
  [/\breadFile\s*\(/, 'readFile('],
  [/\bfs\.promises\b/, 'fs.promises'],
  [/\bimport\.meta\.glob\s*\(/, 'import.meta.glob'],
  [/\bwriteFileSync\s*\(/, 'writeFileSync'],
  [/\bstatSync\s*\(/, 'statSync'],
  [/\bexistsSync\s*\(/, 'existsSync'],
  [/from\s+['"](?:node:)?fs(?:\/promises)?['"]/, "an import from 'node:fs'"],
]

const posix = (p: string) => p.split('\\').join('/')

function testFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) testFiles(full, acc)
    else if (/\.test\.tsx?$/.test(name)) acc.push(full)
  }
  return acc
}

/** Every app test file, with the genre markers found in it. */
const scanned = testFiles(join(APP, 'src'))
  .map((full) => {
    const source = readFileSync(full, 'utf8')
    return {
      file: posix(relative(APP, full)),
      markers: GENRE.filter(([re]) => re.test(source)).map(([, name]) => name),
    }
  })
  .sort((a, b) => a.file.localeCompare(b.file))

const detected = scanned.filter((t) => t.markers.length > 0)
const alwaysOn = new Set(ALWAYS_ON.map((e) => e.file))
const exempt = new Set(EXEMPT.map((e) => e.file))

describe('the always-on test list', () => {
  it('names every test that reads the source tree through the filesystem', () => {
    const missing = detected
      .filter((t) => !alwaysOn.has(t.file) && !exempt.has(t.file))
      .map(
        (t) =>
          `${t.file} reaches the tree via ${t.markers.join(', ')}. ` +
          'A scoped pull-request run will never select it. Add it to ' +
          'ALWAYS_ON in scripts/always-on-tests.mjs with the reason it ' +
          'matters, or to EXEMPT there if the module graph really does ' +
          'reach its subject -- with the reason either way.',
      )

    expect(missing).toEqual([])
  })

  it('still detects every entry that claims to read the tree', () => {
    const flagged = new Set(detected.map((t) => t.file))
    const unflagged = ALWAYS_ON.filter(
      (e) => e.genre === 'filesystem' && !flagged.has(e.file),
    ).map(
      (e) =>
        `${e.file} is listed as genre 'filesystem' but the detector no longer ` +
        'flags it. Either the test stopped reading the tree (mark it ' +
        "'breadth' or drop it) or the detector was narrowed and other tests " +
        'are now slipping past it.',
    )

    expect(unflagged).toEqual([])
  })

  it('lists only files that exist', () => {
    const known = new Set(scanned.map((t) => t.file))
    const gone = [...ALWAYS_ON, ...EXEMPT]
      .map((e) => e.file)
      .filter((file) => !known.has(file))
      .map(
        (file) =>
          `${file} is listed in scripts/always-on-tests.mjs but is not an app ` +
          'test file. It was renamed or deleted: fix the list rather than ' +
          'letting it rot.',
      )

    expect(gone).toEqual([])
  })

  it('gives every entry a reason, and never both lists', () => {
    const unreasoned = [...ALWAYS_ON, ...EXEMPT]
      .filter((e) => e.why.trim().length === 0)
      .map((e) => `${e.file} carries no reason`)
    const both = ALWAYS_ON.filter((e) => exempt.has(e.file)).map(
      (e) => `${e.file} is on ALWAYS_ON and EXEMPT at once`,
    )

    expect([...unreasoned, ...both]).toEqual([])
  })
})
