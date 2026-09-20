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
//   node scripts/code-metrics.mjs --update     # re-freeze the baseline
//   node scripts/code-metrics.mjs --with-lint  # include eslint warning counts
//                                              # (slow: runs the full lint)
//
// See docs/agent/METRICS.md for why these metrics and not others.
// ============================================================

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, } from 'node:fs'
import { extname, join, relative } from 'node:path'

const ROOT = process.cwd()
const BASELINE = join(ROOT, 'docs/agent/code-metrics.baseline.json')
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

if (has('--with-lint')) {
  try {
    const out = execFileSync('pnpm', ['exec', 'eslint', '--format', 'json'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=6144' },
    })
    const res = JSON.parse(out)
    let warn = 0,
      err = 0,
      complexity = 0
    for (const f of res) {
      err += f.errorCount
      warn += f.warningCount
      complexity += f.messages.filter((x) => x.ruleId === 'complexity').length
    }
    m.eslint_errors = err
    m.eslint_warnings = warn
    m.eslint_complexity_warnings = complexity
  } catch {
    console.error('eslint run failed; skipping lint metrics')
  }
}

// -- Report -------------------------------------------------------------

// Direction each metric should move. Anything absent is informational only and
// never fails --check.
const LOWER_IS_BETTER = new Set([
  'files_over_500',
  'files_over_800',
  'files_over_1200',
  'largest_file_loc',
  'mean_file_loc',
  'missing_header_comment',
  'todo_markers',
  'eslint_errors',
  'eslint_warnings',
  'eslint_complexity_warnings',
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

if (has('--update')) {
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
  if (regressions.length) {
    console.error('\nRatchet failed. These got worse:\n')
    for (const r of regressions) console.error(`  ${r}`)
    console.error(
      '\nFix them, or run --update and justify it in the commit message.',
    )
    process.exit(1)
  }
  console.log('\nRatchet OK: nothing tracked got worse.')
}
