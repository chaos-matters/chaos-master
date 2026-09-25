#!/usr/bin/env node
// ============================================================
// The app test suite, scoped to what a branch touched
// ============================================================
//
// `pnpm test` runs all of packages/app, and since 2026-09-24 every pull
// request's CI does, in shards (.github/workflows/node.js.yml). This is the
// local tool for the step before that: run the tests a change can reach, in a
// fraction of the time, before pushing. It picks the subset:
//
//   node scripts/test-changed.mjs                 # against origin/main
//   node scripts/test-changed.mjs <commit-ish>    # against something else
//   TEST_CHANGED_BASE=<sha> node scripts/...      # same, from the environment
//   node scripts/test-changed.mjs --dry-run       # print the selection, run nothing
//
// It is the union of two sets.
//
// 1. What `vitest --changed <base>` selects: every test file whose module
//    graph reaches a file the branch touched -- widened to the whole suite
//    when the branch touched the harness itself (FULL_RUN_TRIGGERS below),
//    because nothing about a scoped run is trustworthy once the thing doing
//    the scoping has changed.
//
// 2. ALWAYS_ON, from ./always-on-tests.mjs: test files that read the source
//    tree through the filesystem instead of importing it. `--changed` works
//    off the module graph, so it cannot see those reads, and the test stays
//    unselected while the very file it guards changes underneath it. The list
//    lives in its own data module so that a test can import it too:
//    packages/app/src/alwaysOnTestList.test.ts fails when a test of that genre
//    is missing from it, which is what keeps the list from going stale.
//
// Core and mobile-runtime are NOT scoped -- they are 100-odd tests that finish
// in under a second, so `pnpm test:pr` runs both in full. Only the app's
// 2,500-plus are worth scoping.
//
// See packages/app/TESTING.md for which checks run where.
// ============================================================

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { ALWAYS_ON } from './always-on-tests.mjs'

const ROOT = process.cwd()
const APP = join(ROOT, 'packages/app')

/**
 * Touch one of these and the whole app suite runs, scoping off.
 *
 * Vitest has the same idea in `forceRerunTriggers`, which defaults to
 * `**\/package.json/**` and `**\/{vitest,vite}.config.*\/**` and gets the
 * resolved `setupFiles` appended. Two of those three work. Checked against
 * vitest 4.1.8 with its own picomatch: `**\/package.json/**` matches
 * `a/package.json`, `**\/{vitest,vite}.config.*\/**` does NOT match
 * `a/vitest.config.ts` -- a trailing `/**` collapses to nothing after a
 * literal segment and does not after a brace-and-wildcard one. Measured, not
 * reasoned: editing packages/app/vitest.config.ts alone selected zero test
 * files.
 *
 * A config that decides what runs is the last change that should be scoped,
 * so the rule lives here instead of depending on an upstream glob that is
 * already wrong in one of its two halves.
 *
 * The scoper counts as harness. This file and the list it reads decide what
 * runs, so a branch touching one of them has to prove itself against the
 * whole suite -- otherwise a change to the selection logic would be validated
 * by the very selection it changed. (The CI workflow was on this list while CI
 * called the scoper; it has run the full suite since 2026-09-24.)
 */
const FULL_RUN_TRIGGERS = [
  /(^|\/)(vite|vitest)\.config\.[^/]+$/,
  /(^|\/)package\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)vitest\.setup\.[^/]+$/,
  /(^|\/)scripts\/test-changed\.mjs$/,
  /(^|\/)scripts\/always-on-tests\.mjs$/,
]

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  return { code: r.status, out: (r.stdout ?? '').trim() }
}

function fail(message) {
  console.error(`test-changed: ${message}`)
  process.exit(1)
}

// -- Base ---------------------------------------------------------------

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const base =
  argv.find((a) => !a.startsWith('--')) ||
  process.env.TEST_CHANGED_BASE ||
  'origin/main'

if (git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]).code !== 0) {
  fail(
    `cannot resolve base ref "${base}". Run \`git fetch origin\`, or pass a ` +
      'commit this clone has (in a shallow clone, fetch its history first).',
  )
}

// -- Did the harness itself change? --------------------------------------

// The same three sources vitest's git provider reads, so the two agree on
// what "changed" means: committed since the merge base, staged, and unstaged
// or untracked.
const touched = [
  ...git(['diff', '--name-only', `${base}...HEAD`]).out.split('\n'),
  ...git(['diff', '--cached', '--name-only']).out.split('\n'),
  ...git(['ls-files', '--other', '--modified', '--exclude-standard']).out.split(
    '\n',
  ),
].filter(Boolean)

const fullRunBecause = [
  ...new Set(touched.filter((f) => FULL_RUN_TRIGGERS.some((r) => r.test(f)))),
].sort()

if (fullRunBecause.length > 0) {
  console.log(`\nFull app suite against ${base}`)
  console.log('  scoping is off: the test harness itself changed')
  for (const file of fullRunBecause) console.log(`    ${file}`)
  console.log('')
  if (dryRun) process.exit(0)
  const all = spawnSync('pnpm', ['exec', 'vitest', 'run'], {
    cwd: APP,
    stdio: 'inherit',
  })
  process.exit(all.status ?? 1)
}

// -- What --changed selects ---------------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'cm-test-changed-'))
const listFile = join(tmp, 'changed.json')
let changed = []
try {
  const list = spawnSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'list',
      '--filesOnly',
      `--json=${listFile}`,
      '--changed',
      base,
    ],
    { cwd: APP, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )
  if (list.status !== 0) fail(`vitest list exited ${list.status}`)
  if (existsSync(listFile)) {
    changed = JSON.parse(readFileSync(listFile, 'utf8')).map((e) => e.file)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

// -- Union ---------------------------------------------------------------

const selected = new Set(changed.map((f) => relative(APP, f)))
const byChanged = selected.size
const added = []

for (const { file, why } of ALWAYS_ON) {
  if (!existsSync(join(APP, file))) {
    fail(
      `ALWAYS_ON lists ${file}, which does not exist. It was renamed or ` +
        'deleted: fix scripts/always-on-tests.mjs rather than letting it rot.',
    )
  }
  if (!selected.has(file)) {
    selected.add(file)
    added.push([file, why])
  }
}

const files = [...selected].sort()

console.log(`\nScoped app suite against ${base}`)
console.log(`  ${byChanged} file(s) selected by --changed`)
console.log(`  ${added.length} added from the always-on list:`)
for (const [file, why] of added) console.log(`    ${file}  (${why})`)
console.log(`  ${files.length} file(s) to run\n`)

if (dryRun) {
  for (const file of files) console.log(`  ${file}`)
  process.exit(0)
}

// -- Run -----------------------------------------------------------------

const run = spawnSync(
  'pnpm',
  ['exec', 'vitest', 'run', '--passWithNoTests', ...files],
  { cwd: APP, stdio: 'inherit' },
)
process.exit(run.status ?? 1)
