#!/usr/bin/env node
// ============================================================
// Agent index generator
// ============================================================
//
// Builds the mechanical half of docs/agent/INDEX.md straight from the
// filesystem, so the map an agent reads can never drift from the code it
// describes. Module blurbs are harvested from each file's leading comment
// block -- the docs live next to the code and are updated by whoever edits it.
//
// Hand-written prose (gotchas, "start here" pointers, invariants) lives
// OUTSIDE the generated markers and is preserved verbatim across runs.
//
//   node scripts/gen-agent-index.mjs           # rewrite the generated blocks
//   node scripts/gen-agent-index.mjs --check   # CI: fail if stale
//
// Adapted from the same generator in the MercuryPitch repo. The design
// decisions worth keeping are commented where they occur: LOC bucketing,
// deterministic tie-breaks, and skipping dot-directories.
// ============================================================

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, } from 'node:fs'
import { basename, dirname, extname, join, relative } from 'node:path'
import prettier from 'prettier'

const ROOT = process.cwd()
const OUT = join(ROOT, 'docs/agent/INDEX.md')
const OUT_DIR = dirname(OUT)
const CHECK = process.argv.includes('--check')

const CODE_EXT = new Set(['.ts', '.tsx'])
const SKIP_DIR = new Set([
  'node_modules',
  'dist',
  '__tests__',
  'coverage-audit',
])

/**
 * Dot-directories are tool state and build caches -- .wrangler, .vite, .git.
 * They are gitignored, so they exist on a developer's machine and not on CI,
 * and counting them makes the index depend on whose machine generated it.
 * No source lives under a dot-directory, so skip the lot.
 */
const skipDir = (name) => SKIP_DIR.has(name) || name.startsWith('.')
const isTest = (p) => /\.(test|spec)\.[tj]sx?$/.test(p) || p.includes('/e2e/')

/** Every code file under `dir`, recursively, excluding tests and build output. */
function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    if (skipDir(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else if (CODE_EXT.has(extname(name)) && !isTest(full)) acc.push(full)
  }
  return acc
}

const loc = (file) => readFileSync(file, 'utf8').split('\n').length

function cap(text) {
  if (!text) return ''
  const m = text.match(/^(.{0,140}?[.])(\s|$)/)
  if (m) return m[1].trim()
  return text.length > 140 ? `${text.slice(0, 137).trim()}...` : text.trim()
}

/** A `/** ... *\/` block sitting directly above the first export. */
function jsdocAboveExport(src) {
  const m = src.match(
    /\/\*\*([\s\S]*?)\*\/\s*\n\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|interface|type)\b/,
  )
  if (!m) return ''
  const text = m[1]
    .split('\n')
    .map((l) => l.replace(/^\s*\*?\s?/, '').trim())
    .filter((l) => l && !l.startsWith('@'))
    .join(' ')
    .replace(/\s+/g, ' ')
  return cap(text)
}

/** The banner/comment block at the very top of the file, before any code. */
function leadingComment(src) {
  const lines = src.split('\n')
  const out = []
  for (const raw of lines.slice(0, 40)) {
    const line = raw.trim()
    if (!line) {
      if (out.length) break
      continue
    }
    if (
      line.startsWith('//') ||
      line.startsWith('/*') ||
      line.startsWith('*')
    ) {
      const text = line
        .replace(/^\/\*+|^\*+\/?|^\/\/+/g, '')
        .replace(/[=─—-]{4,}/g, '')
        .trim()
      if (text) out.push(text)
      continue
    }
    break
  }
  if (!out.length) return ''
  return cap(out.join(' ').replace(/\s+/g, ' '))
}

/**
 * Pull the first meaningful sentence out of a file's leading comment block.
 * Returns '' when the file has no header comment -- an empty blurb is an
 * honest signal that the file needs one, not something to paper over.
 */
function blurb(file) {
  const src = readFileSync(file, 'utf8')
  return leadingComment(src) || jsdocAboveExport(src)
}

/** Best entry point for a module dir: index, a name match, else the biggest. */
function entryOf(files, dirName) {
  const pascal = dirName.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())
  const score = (f) => {
    const b = basename(f)
    if (/^index\.tsx?$/.test(b)) return 6
    if (new RegExp(`^${dirName}`, 'i').test(b)) return 5
    if (new RegExp(`^use${pascal}[A-Za-z]*\\.tsx?$`).test(b)) return 4
    if (/(App|View|Page|Panel|Modal|Overlay)\.tsx?$/.test(b)) return 3
    if (/^use[A-Z].*\.tsx?$/.test(b)) return 2
    return 1
  }
  // Name breaks the final tie: readdirSync order differs between machines, so
  // without it a score-and-LOC tie picks a different entry point on CI than
  // locally, and --check fails on a tree that is clean.
  return [...files].sort(
    (a, b) => score(b) - score(a) || loc(b) - loc(a) || a.localeCompare(b),
  )[0]
}

const rel = (f) => relative(ROOT, f)
const href = (relPath) => relative(OUT_DIR, join(ROOT, relPath))
const link = (text, relPath) => `[${text}](${href(relPath)})`

// LOC are quantized before display AND sorting. Exact counts change on nearly
// every commit, and a size-ordered generated file that shifts with every merged
// PR is a standing merge conflict for every open branch. With 50/100-line
// buckets a file has to genuinely grow before its row moves.
const bucketLoc = (n) =>
  n >= 1000 ? Math.round(n / 100) * 100 : Math.max(50, Math.round(n / 50) * 50)

const fmtLoc = (n) => {
  const b = bucketLoc(n)
  return b >= 1000 ? `${(b / 1000).toFixed(1)}k` : String(b)
}

/** Table of every subdirectory of `base` treated as a module. */
function dirTable(base, label) {
  const dir = join(ROOT, base)
  if (!existsSync(dir)) return ''
  const rows = readdirSync(dir)
    .filter((n) => !skipDir(n) && statSync(join(dir, n)).isDirectory())
    .map((name) => {
      const files = walk(join(dir, name))
      if (!files.length) return null
      const entry = entryOf(files, name)
      const total = files.reduce((s, f) => s + loc(f), 0)
      return { name, entry: rel(entry), loc: total, blurb: blurb(entry) }
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        bucketLoc(b.loc) - bucketLoc(a.loc) || a.name.localeCompare(b.name),
    )

  if (!rows.length) return ''
  const body = rows
    .map(
      (r) =>
        `| \`${r.name}\` | ${link(basename(r.entry), r.entry)} | ${fmtLoc(r.loc)} | ${r.blurb || '_(no header comment)_'} |`,
    )
    .join('\n')
  return `#### ${label}\n\n| Module | Entry point | LOC | What it is |\n|---|---|---|---|\n${body}\n`
}

/** Table of loose files directly inside `base` (no subdir grouping). */
function fileTable(base, label, { min = 0, limit = Infinity } = {}) {
  const dir = join(ROOT, base)
  if (!existsSync(dir)) return ''
  const rows = readdirSync(dir)
    .filter((n) => CODE_EXT.has(extname(n)) && !isTest(join(base, n)))
    .map((n) => {
      const full = join(dir, n)
      return { name: n, path: rel(full), loc: loc(full), blurb: blurb(full) }
    })
    .filter((r) => r.loc >= min)
    .sort(
      (a, b) =>
        bucketLoc(b.loc) - bucketLoc(a.loc) || a.name.localeCompare(b.name),
    )
    .slice(0, limit)

  if (!rows.length) return ''
  const body = rows
    .map(
      (r) =>
        `| ${link(r.name, r.path)} | ${fmtLoc(r.loc)} | ${r.blurb || '_(no header comment)_'} |`,
    )
    .join('\n')
  return `#### ${label}\n\n| File | LOC | What it is |\n|---|---|---|\n${body}\n`
}

/** The workspace packages, so the first question an agent has is answered. */
function packageTable() {
  const rows = readdirSync(join(ROOT, 'packages'))
    .filter(
      (n) => !skipDir(n) && statSync(join(ROOT, 'packages', n)).isDirectory(),
    )
    .map((name) => {
      const dir = join(ROOT, 'packages', name)
      const files = walk(dir)
      const pkgPath = join(dir, 'package.json')
      const pkgName = existsSync(pkgPath)
        ? JSON.parse(readFileSync(pkgPath, 'utf8')).name
        : name
      const tests = walk(dir, []).length
      return {
        name,
        pkgName,
        loc: files.reduce((s, f) => s + loc(f), 0),
        files: tests,
      }
    })
    .sort(
      (a, b) =>
        bucketLoc(b.loc) - bucketLoc(a.loc) || a.name.localeCompare(b.name),
    )
  const body = rows
    .map(
      (r) =>
        `| \`packages/${r.name}\` | \`${r.pkgName}\` | ${r.files} | ${fmtLoc(r.loc)} |`,
    )
    .join('\n')
  return `| Directory | Package name | Source files | LOC |\n|---|---|---|---|\n${body}`
}

/** Files big enough that reading them whole is a context-budget decision. */
function heavyFiles(threshold = 1000) {
  const files = walk(join(ROOT, 'packages'))
    .map((f) => ({ path: rel(f), loc: loc(f) }))
    .filter((r) => r.loc >= threshold)
    .sort(
      (a, b) =>
        bucketLoc(b.loc) - bucketLoc(a.loc) || a.path.localeCompare(b.path),
    )
  if (!files.length) return ''
  const body = files
    .map((r) => `| ${link(r.path, r.path)} | ${fmtLoc(r.loc)} |`)
    .join('\n')
  return [
    `Reading any of these end-to-end costs roughly ${fmtLoc(threshold)}+ lines of context.`,
    `Grep for the symbol and read the surrounding range instead.`,
    ``,
    `| File | LOC |`,
    `|---|---|`,
    body,
  ].join('\n')
}

function scriptTable() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const body = Object.entries(pkg.scripts ?? {})
    .map(([k, v]) => `| \`pnpm ${k}\` | \`${v}\` |`)
    .join('\n')
  return `| Script | Runs |\n|---|---|\n${body}`
}

const A = 'packages/app/src'
const SECTIONS = {
  packages: packageTable(),
  'module-map': [
    dirTable(
      `${A}/flame`,
      'Flame engine (`packages/app/src/flame/`) — variations, pipeline, serialization',
    ),
    dirTable(
      `${A}/components`,
      'Components (`packages/app/src/components/`) — UI surfaces',
    ),
    dirTable(
      `${A}/pages`,
      'Pages (`packages/app/src/pages/`) — route-level shells',
    ),
    dirTable(
      `${A}/worker`,
      'Cloudflare Worker (`packages/app/src/worker/`) — backend routes',
    ),
    dirTable(
      `${A}/webmcp`,
      'WebMCP (`packages/app/src/webmcp/`) — agent-callable tool surface',
    ),
    dirTable(
      'packages/core/src',
      'Core package (`packages/core/src/`) — pure, dependency-free logic',
    ),
    fileTable(
      `${A}/arcade`,
      'Arcade (`packages/app/src/arcade/`) — arena, director and beats modes',
      { min: 100 },
    ),
    fileTable(`${A}/hooks`, 'Workspace hooks (`packages/app/src/hooks/`)', {
      min: 100,
    }),
    fileTable(
      `${A}/recorder`,
      'Recorder (`packages/app/src/recorder/`) — deterministic capture and replay',
      { min: 100 },
    ),
    fileTable(
      `${A}/benchmarks`,
      'Benchmarks (`packages/app/src/benchmarks/`)',
      { min: 100 },
    ),
    fileTable(
      `${A}/commands`,
      'Command registry (`packages/app/src/commands/`)',
      { min: 100 },
    ),
    fileTable(
      `${A}/stores`,
      'Stores (`packages/app/src/stores/`) — global reactive state',
    ),
    fileTable(`${A}/utils`, 'Utilities (`packages/app/src/utils/`, 200+ LOC)', {
      min: 200,
    }),
    fileTable(`${A}/lib`, 'Library (`packages/app/src/lib/`, 200+ LOC)', {
      min: 200,
    }),
    fileTable(A, 'Application root (`packages/app/src/*.tsx`)'),
  ]
    .filter(Boolean)
    .join('\n'),
  'heavy-files': heavyFiles(),
  scripts: scriptTable(),
}

// -- Splice generated blocks into the existing file, preserving prose --
if (!existsSync(OUT)) {
  console.error(
    `${rel(OUT)} not found -- create it with the marker comments first.`,
  )
  process.exit(1)
}

const before = readFileSync(OUT, 'utf8')
let after = before
for (const [key, content] of Object.entries(SECTIONS)) {
  const re = new RegExp(
    `(<!-- BEGIN:GENERATED ${key} -->\\n)[\\s\\S]*?(<!-- END:GENERATED ${key} -->)`,
  )
  if (!re.test(after)) {
    console.error(`Missing markers for section "${key}" in ${rel(OUT)}`)
    process.exit(1)
  }
  after = after.replace(re, `$1${content}\n$2`)
}

// Format the result with the repo's own prettier config before comparing or
// writing. The pre-commit hook runs `prettier --write` over docs/, which
// reformats these generated tables -- so an unformatted comparison here would
// report the file stale immediately after every commit, and `docs:index:check`
// would be red in CI forever. Generate-then-format is the canonical output.
const options = await prettier.resolveConfig(OUT)
after = await prettier.format(after, { ...options, filepath: OUT })

if (CHECK) {
  if (after !== before) {
    console.error(`${rel(OUT)} is stale. Run: node scripts/gen-agent-index.mjs`)
    process.exit(1)
  }
  console.log(`${rel(OUT)} is up to date.`)
} else if (after !== before) {
  writeFileSync(OUT, after)
  console.log(`Updated ${rel(OUT)}`)
} else {
  console.log(`${rel(OUT)} already up to date.`)
}
