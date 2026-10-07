#!/usr/bin/env node
// ============================================================
// Code metrics
// ============================================================
//
// Measures the things about this codebase that are worth watching, and
// RATCHETS them: `--check` compares against docs/agent/code-metrics.baseline.json
// and fails only when a tracked number got WORSE. It is deliberately not a
// threshold gate. Absolute gates on a codebase this size either never fire or
// are red forever, and both teach people to ignore them.
//
//   node scripts/code-metrics.mjs              # today's numbers
//   node scripts/code-metrics.mjs --json       # same, machine-readable
//   node scripts/code-metrics.mjs --check      # ratchet: fail on regression
//   node scripts/code-metrics.mjs --update     # re-freeze the baseline; refuses
//                                              # to drop a key the baseline has
//   node scripts/code-metrics.mjs --update --drop=<key>[,<key>]
//                                              # ...unless the key is named
//   node scripts/code-metrics.mjs --with-lint  # include eslint warning counts
//                                              # (slow: runs the full lint)
//   node scripts/code-metrics.mjs --lint-report=<file>
//                                              # the same keys, read from a
//                                              # JSON report ESLint already
//                                              # wrote (CI's build job)
//   node scripts/code-metrics.mjs --lower-caps # lower every per-file cap that
//                                              # can go down; never raises one
//
// --check also holds every source file of 800 lines or more to its own cap in
// docs/agent/code-metrics.file-caps.json (scripts/file-caps.mjs says how).
// The caps file is edited by hand or by --lower-caps, never by --update.
//
// See docs/agent/METRICS.md for why these metrics and not others.
// ============================================================

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { atBucketEdge, CAP_FLOOR, capFailures, checkFileCaps, formatCaps, lowerCaps, } from './file-caps.mjs'

const ROOT = process.cwd()
const BASELINE = join(ROOT, 'docs/agent/code-metrics.baseline.json')
const FILE_CAPS = join(ROOT, 'docs/agent/code-metrics.file-caps.json')
const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)

const CODE_EXT = new Set(['.ts', '.tsx'])
const SKIP = new Set(['node_modules', 'dist', '__tests__', 'coverage-audit'])
const skipDir = (n) => SKIP.has(n) || n.startsWith('.')
const isTest = (p) => /\.(test|spec)\.[tj]sx?$/.test(p)

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    if (skipDir(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else if (CODE_EXT.has(extname(name))) acc.push(full)
  }
  return acc
}

const lines = (f) => readFileSync(f, 'utf8').split('\n').length

// -- Measure ------------------------------------------------------------

const all = walk(join(ROOT, 'packages'))
const src = all.filter((f) => !isTest(f))
const tests = all.filter(isTest)

const srcLoc = src.map(lines)
const total = srcLoc.reduce((a, b) => a + b, 0)
const sorted = [...src]
  .map((f) => ({ f: relative(ROOT, f), n: lines(f) }))
  .sort((a, b) => b.n - a.n)

// A DATA file is literal payload, not logic: at least DATA_LITERAL_SHARE of
// its lines belong to top-level `const`/`let` declarations whose initializer
// (through `as`, `satisfies` and parentheses) is an object or array literal
// holding no function. A table of handlers is logic, so any arrow, function
// expression or method inside disqualifies the declaration. Measured with the
// TypeScript parser, not a path list, so a new data file needs no config and
// a logic file cannot be excluded by moving it into a data directory.
//
// The threshold sits in a gap. On 2026-09-23 the data files measure 90-100%
// (the six flame/variations/docs/content*.ts files, flame/examples/animations.ts
// at 92%, flame/palettes.ts at 90%) and the most literal logic file measures
// 58% (arcade/topics.ts).
const DATA_LITERAL_SHARE = 0.8

function literalShare(file) {
  const text = readFileSync(file, 'utf8')
  const ast = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const lineOf = (pos) => ast.getLineAndCharacterOfPosition(pos).line + 1
  let literal = 0
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue
    const span =
      lineOf(statement.getEnd()) - lineOf(statement.getStart(ast)) + 1
    const allLiteral = statement.declarationList.declarations.every((d) => {
      let init = d.initializer
      while (
        init &&
        (ts.isAsExpression(init) ||
          ts.isSatisfiesExpression(init) ||
          ts.isParenthesizedExpression(init))
      )
        init = init.expression
      if (
        !init ||
        !(
          ts.isObjectLiteralExpression(init) ||
          ts.isArrayLiteralExpression(init)
        )
      )
        return false
      let fns = 0
      const walk = (n) => {
        if (
          ts.isArrowFunction(n) ||
          ts.isFunctionExpression(n) ||
          ts.isMethodDeclaration(n) ||
          ts.isGetAccessorDeclaration(n) ||
          ts.isSetAccessorDeclaration(n)
        )
          fns++
        ts.forEachChild(n, walk)
      }
      walk(init)
      return fns === 0
    })
    if (allLiteral) literal += span
  }
  return literal / text.split('\n').length
}

// The largest file that is not data. Walk down from the largest file and stop
// at the first logic file, so only the handful of files above it are parsed.
const dataFilesAbove = []
let largestLogic = { f: '', n: 0 }
for (const r of sorted) {
  const share = literalShare(join(ROOT, r.f))
  if (share >= DATA_LITERAL_SHARE) {
    dataFilesAbove.push({ ...r, share })
    continue
  }
  largestLogic = r
  break
}

// Test cases counted statically. Not as good as running the suite, but it does
// not need a 25-second vitest run to answer "did we add tests this week".
let cases = 0
for (const t of tests) {
  const s = readFileSync(t, 'utf8')
  cases += (s.match(/^\s*(it|test)(\.\w+)?\s*\(/gm) || []).length
}

// Header-comment coverage: an entry point with no leading comment block is a
// module the generated index cannot describe. Same rule as gen-agent-index.mjs.
const hasHeader = (f) => {
  const ls = readFileSync(f, 'utf8').split('\n')
  for (const raw of ls.slice(0, 40)) {
    const l = raw.trim()
    if (!l) continue
    return l.startsWith('//') || l.startsWith('/*') || l.startsWith('*')
  }
  return false
}
const missingHeader = src.filter((f) => !hasHeader(f)).length

let todos = 0
for (const f of src) {
  todos += (readFileSync(f, 'utf8').match(/\b(TODO|FIXME|XXX|HACK)\b/g) || [])
    .length
}

const m = {
  source_files: src.length,
  source_loc: total,
  mean_file_loc: Math.round(total / src.length),
  files_over_500: srcLoc.filter((n) => n > 500).length,
  files_over_800: srcLoc.filter((n) => n > 800).length,
  files_over_1200: srcLoc.filter((n) => n > 1200).length,
  largest_file_loc: sorted[0] ? sorted[0].n : 0,
  largest_logic_file_loc: largestLogic.n,
  test_files: tests.length,
  test_cases: cases,
  test_file_ratio: Number((tests.length / src.length).toFixed(3)),
  missing_header_comment: missingHeader,
  todo_markers: todos,
}

// Coverage, if a run has produced a summary. Never fails the build when absent.
// Core is reported on its own: merged into the app's number, its gap would
// vanish in the app's mass, which is how it went unmeasured in the first place.
const COVERAGE = [
  ['coverage', 'packages/app/coverage-audit/coverage-summary.json'],
  ['coverage_core', 'packages/core/coverage-audit/coverage-summary.json'],
]
for (const [prefix, file] of COVERAGE) {
  const covPath = join(ROOT, file)
  if (!existsSync(covPath)) continue
  const c = JSON.parse(readFileSync(covPath, 'utf8')).total
  m[`${prefix}_lines_pct`] = c.lines.pct
  m[`${prefix}_functions_pct`] = c.functions.pct
  m[`${prefix}_branches_pct`] = c.branches.pct
}

// The lint keys come from a fresh ESLint run (--with-lint), or from the JSON
// report an earlier run wrote (--lint-report=<file>). CI's lint job uses the
// second: its lint step writes the report through
// scripts/eslint-report-formatter.mjs, so the ratchet costs no second pass.
const lintReportArg = argv.find((a) => a.startsWith('--lint-report='))
const lintReport = lintReportArg?.slice('--lint-report='.length)
const withLint = has('--with-lint') || lintReport !== undefined

function lintFailed(why) {
  console.error(`${why}; the lint metrics cannot be measured.`)
  process.exit(2)
}

let lintResults
if (lintReport !== undefined) {
  // A missing, empty or unreadable report is no run, never a clean one.
  // resolve, not join: an absolute path is taken as given.
  const file = resolve(ROOT, lintReport)
  if (!existsSync(file)) lintFailed(`no ESLint report at ${lintReport}`)
  try {
    lintResults = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    lintFailed(`${lintReport} is not an ESLint JSON report`)
  }
  if (!Array.isArray(lintResults) || lintResults.length === 0)
    lintFailed(`${lintReport} lists no linted files`)
} else if (has('--with-lint')) {
  // ESLint exits 1 when it found an error and still prints its full report,
  // so 0 and 1 are both a run to count. Only a crash (2, a signal, or output
  // that is not the JSON report) is no run. This used to catch every non-zero
  // exit and skip the lint keys, which let `eslint_errors` go from 0 to
  // anything with a green check. Now a lint run that was asked for and did
  // not happen fails the command.
  const run = spawnSync('pnpm', ['exec', 'eslint', '--format', 'json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=6144' },
  })
  try {
    if (run.status !== 0 && run.status !== 1) throw new Error()
    lintResults = JSON.parse(run.stdout)
  } catch {
    const tail = (run.stderr ?? '').slice(-2000)
    lintFailed(
      `eslint did not produce a report (exit ${run.status}, signal ` +
        `${run.signal})\n${tail}`,
    )
  }
}

if (lintResults !== undefined) {
  let warn = 0,
    err = 0,
    complexity = 0,
    maxComplexity = 0
  for (const f of lintResults) {
    err += f.errorCount
    warn += f.warningCount
    for (const x of f.messages) {
      if (x.ruleId !== 'complexity') continue
      complexity++
      // "... has a complexity of 73. Maximum allowed is 20."
      const n = Number(/complexity of (\d+)/.exec(x.message)?.[1] ?? 0)
      if (n > maxComplexity) maxComplexity = n
    }
  }
  m.eslint_errors = err
  m.eslint_warnings = warn
  m.eslint_complexity_warnings = complexity
  // The worst function, not only how many are over the line: a count holds
  // planGlide's 73 no better than a 21.
  m.eslint_max_complexity = maxComplexity
}

// -- Per-file caps ------------------------------------------------------

const counts = new Map(sorted.map((r) => [r.f.split('\\').join('/'), r.n]))
const caps = existsSync(FILE_CAPS)
  ? JSON.parse(readFileSync(FILE_CAPS, 'utf8'))
  : null

// -- Report -------------------------------------------------------------

// Direction each metric should move. Anything absent is informational only and
// never fails --check.
const LOWER_IS_BETTER = new Set([
  'files_over_500',
  'files_over_800',
  'files_over_1200',
  'largest_file_loc',
  'largest_logic_file_loc',
  // Not `mean_file_loc`: reported, never gated (WP3, 2026-09-23). The check
  // compared a rounded mean that deleting a small dead file RAISES, and it
  // sat half a line from its edge, so changes were shaving comments to fit.
  // The tail carries the signal: files_over_* and largest_logic_file_loc.
  // docs/agent/METRICS.md says more.
  'missing_header_comment',
  'todo_markers',
  'eslint_errors',
  'eslint_warnings',
  'eslint_complexity_warnings',
  'eslint_max_complexity',
])
const HIGHER_IS_BETTER = new Set([
  'test_files',
  'test_cases',
  'test_file_ratio',
  'coverage_lines_pct',
  'coverage_functions_pct',
  'coverage_branches_pct',
  'coverage_core_lines_pct',
  'coverage_core_functions_pct',
  'coverage_core_branches_pct',
])

if (has('--json')) {
  console.log(JSON.stringify(m, null, 2))
  process.exit(0)
}

if (has('--lower-caps')) {
  if (caps === null) {
    console.error(`No caps file at ${relative(ROOT, FILE_CAPS)}.`)
    process.exit(1)
  }
  const lowered = lowerCaps(counts, caps)
  const changed = Object.keys(caps).filter((k) => lowered[k] !== caps[k])
  writeFileSync(FILE_CAPS, formatCaps(lowered))
  for (const k of changed) {
    console.log(
      k in lowered
        ? `  lowered ${k}: ${caps[k]} -> ${lowered[k]}`
        : `  removed ${k} (cap ${caps[k]})`,
    )
  }
  console.log(
    `${changed.length} cap(s) changed in ${relative(ROOT, FILE_CAPS)}. ` +
      'Nothing was raised or added.',
  )
  const left = capFailures(checkFileCaps(counts, lowered))
  if (left.length) {
    console.error(
      '\nStill failing, and only a hand edit or a split fixes it:\n',
    )
    for (const l of left) console.error(`  ${l}`)
    process.exit(1)
  }
  process.exit(0)
}

if (has('--update')) {
  // Refuse to drop a key the baseline tracks. A key this run did not produce
  // is usually not a metric that went away but one that needs another run
  // first -- the six coverage keys after no coverage run, the eslint keys
  // without --with-lint -- and writing the baseline anyway silently deletes
  // that ratchet. Removing a metric on purpose names it: --drop=<key>.
  const drop = new Set(
    argv
      .filter((a) => a.startsWith('--drop='))
      .flatMap((a) => a.slice('--drop='.length).split(','))
      .filter(Boolean),
  )
  const base = existsSync(BASELINE)
    ? JSON.parse(readFileSync(BASELINE, 'utf8'))
    : {}
  const missing = Object.keys(base).filter((k) => !(k in m) && !drop.has(k))
  if (missing.length) {
    console.error(
      `\nRefusing to re-freeze: this run did not produce ${missing.length} ` +
        `key(s) the baseline tracks, and writing it would drop them:\n`,
    )
    for (const k of missing) console.error(`  ${k}`)
    console.error(
      '\ncoverage_*: run `pnpm test:coverage` first. eslint_*: add ' +
        '--with-lint.\nA metric removed on purpose: --drop=<key>[,<key>], ' +
        'and say why in the commit message.',
    )
    process.exit(1)
  }
  writeFileSync(BASELINE, `${JSON.stringify(m, null, 2)}\n`)
  console.log(`Baseline re-frozen at ${relative(ROOT, BASELINE)}.`)
  console.log('Say why in the commit message.')
  process.exit(0)
}

const pad = (s, n) => String(s).padEnd(n)
console.log('\nCode metrics\n')
for (const [k, v] of Object.entries(m)) console.log(`  ${pad(k, 30)}${v}`)

console.log('\nLargest files\n')
for (const r of sorted.slice(0, 10)) console.log(`  ${pad(r.n, 8)}${r.f}`)

const edge = atBucketEdge(counts)
if (edge.length) {
  console.log('\nSitting exactly on a bucket edge (one more line crosses it)\n')
  for (const r of edge) console.log(`  ${pad(r.lines, 8)}${r.file}`)
}
const cappedCount = [...counts.values()].filter((n) => n >= CAP_FLOOR).length
console.log(
  `\nPer-file caps: ${cappedCount} files of ${CAP_FLOOR} lines or more, ` +
    `each held to its cap in ${relative(ROOT, FILE_CAPS)}`,
)

console.log('\nLargest logic file (largest_logic_file_loc)\n')
console.log(`  ${pad(largestLogic.n, 8)}${largestLogic.f}`)
console.log(
  `\n  Skipped above it as data (>= ${DATA_LITERAL_SHARE * 100}% literal lines):`,
)
for (const r of dataFilesAbove)
  console.log(`  ${pad(r.n, 8)}${r.f} (${Math.round(r.share * 100)}%)`)

if (has('--check')) {
  if (!existsSync(BASELINE)) {
    console.error(
      `\nNo baseline at ${relative(ROOT, BASELINE)}. Run --update first.`,
    )
    process.exit(1)
  }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'))
  const regressions = []
  for (const [k, v] of Object.entries(m)) {
    if (!(k in base)) continue
    if (LOWER_IS_BETTER.has(k) && v > base[k])
      regressions.push(`${k}: ${base[k]} -> ${v}`)
    if (HIGHER_IS_BETTER.has(k) && v < base[k])
      regressions.push(`${k}: ${base[k]} -> ${v}`)
  }
  // Asked for the lint keys: every one the baseline tracks must have been
  // measured, or the check would pass on keys it never compared.
  if (withLint) {
    for (const k of Object.keys(base).filter((x) => x.startsWith('eslint_'))) {
      if (!(k in m)) regressions.push(`${k}: not measured by this run`)
    }
  }
  const capProblems =
    caps === null
      ? [`no caps file at ${relative(ROOT, FILE_CAPS)}`]
      : capFailures(checkFileCaps(counts, caps))
  if (regressions.length) {
    console.error('\nRatchet failed. These got worse:\n')
    for (const r of regressions) console.error(`  ${r}`)
    console.error(
      '\nFix them, or run --update and justify it in the commit message.',
    )
  }
  if (capProblems.length) {
    console.error(
      `\nPer-file caps failed (${relative(ROOT, FILE_CAPS)}, ` +
        'scripts/file-caps.mjs):\n',
    )
    for (const r of capProblems) console.error(`  ${r}`)
  }
  if (regressions.length || capProblems.length) process.exit(1)
  console.log(
    '\nRatchet OK: nothing tracked got worse, and every file of ' +
      `${CAP_FLOOR} lines or more is at its cap.`,
  )
}
