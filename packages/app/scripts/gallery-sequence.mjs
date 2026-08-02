#!/usr/bin/env node
// Generate a gallery row's curated flame SEQUENCE and store it in D1.
//
// A `gallery_items.sequence` row plays through `[flame, ...sequence]` instead of
// resting on one still (see migrations/0004_gallery_sequence.sql). This produces
// that list ONCE, from the app's own randomiser, and writes it — the render path
// never generates anything, so every visitor sees the same curated path and a
// bad roll is fixed by re-running with another seed rather than by hoping.
//
//   node scripts/gallery-sequence.mjs cap-randomizer            # print the SQL
//   node scripts/gallery-sequence.mjs cap-randomizer --apply local
//   node scripts/gallery-sequence.mjs cap-randomizer --paths 2  # two paths
//   node scripts/gallery-sequence.mjs cap-randomizer --clear --apply local
//
// Options:
//   --seed <n>     PRNG seed. The same seed always produces the same flames.
//   --paths <n>    Curated paths to concatenate (default 1). Each is a whole
//                  run; the column is flat, so the player just walks them.
//   --derived <n>  Flames derived from each path's opening roll (default 3).
//   --no-roll      Derive straight from the row's own flame instead of opening
//                  each path with a freshly rolled one.
//   --strength <f> Randomiser strength (default 0.5, the card's own default).
//   --mode <m>     What the derived flames are (default steer):
//                    steer — the row's flame pushed around by mutation, which
//                            is the Randomizer card's claim.
//                    breed — the row's flame crossed with a freshly rolled
//                            mate, one child per crossover mode, which is the
//                            Genetics card's. The mate is emitted first so the
//                            walk shows both parents before their children.
//                  e.g. node scripts/gallery-sequence.mjs cap-genetics \
//                         --mode breed --derived 5 --apply local
//   --apply <env>  local | dev | prod. Writing anywhere but local is a
//                  deliberate act; this script does not default to it.
//   --out <file>   Write the SQL to a file.
//   --clear        Set the column back to NULL — the single-flame behaviour.
//   --append <file>  Append ONE hand-picked flame from a PNG/JSON to the end of
//                  the row's existing sequence, instead of generating. The file
//                  is validated exactly as `gallery-admin put` validates one.
//                  e.g. node scripts/gallery-sequence.mjs cap-randomizer \
//                         --append ~/flames/finale.png --apply local
//
// Why a script of its own rather than a gallery-admin subcommand: this is the
// only piece of gallery tooling that has to RUN APP CODE (src/flame/randomize.ts
// is TypeScript, and reimplementing it would defeat the point). seed-gallery.mjs
// already owns that shape — bundle a tiny TS entry with esbuild, run it in plain
// node — so this follows it, and gallery-admin stays a pure database tool.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeSource } from './gallery-admin.mjs'
import { initCommand, isMissingTable, migrationsArgs, storageFlags, tail, TARGET_LIST, targetLabel, TARGETS, } from './gallery-targets.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')

/** The Worker's own slug guard — a slug it would reject can never be fetched. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/

const DEFAULTS = {
  seed: 20260802,
  paths: 1,
  derived: 3,
  strength: 0.5,
  mode: 'steer',
}
const MODES = ['steer', 'breed']

const sqlStr = (value) =>
  value === null || value === undefined
    ? 'NULL'
    : `'${String(value).replace(/'/g, "''")}'`

function fail(message, detail) {
  console.error(`gallery-sequence: ${message}`)
  if (detail) console.error(detail)
  process.exit(1)
}

function parseArgs(argv) {
  const args = {
    ...DEFAULTS,
    slug: null,
    apply: null,
    out: null,
    roll: true,
    append: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--seed') args.seed = Number(argv[++i])
    else if (arg === '--paths') args.paths = Number(argv[++i])
    else if (arg === '--derived') args.derived = Number(argv[++i])
    else if (arg === '--strength') args.strength = Number(argv[++i])
    else if (arg === '--mode') args.mode = String(argv[++i])
    else if (arg === '--no-roll') args.roll = false
    else if (arg === '--apply') args.apply = argv[++i]
    else if (arg === '--out') args.out = argv[++i]
    else if (arg === '--clear') args.clear = true
    else if (arg === '--append') args.append = argv[++i]
    else if (arg.startsWith('-')) fail(`unknown option ${arg}`)
    else if (args.slug === null) args.slug = arg
    else fail(`unexpected argument ${arg}`)
  }
  if (!MODES.includes(args.mode)) {
    fail(
      `unknown --mode "${args.mode}"`,
      `expected one of: ${MODES.join(', ')}`,
    )
  }
  return args
}

/**
 * Run SQL through wrangler and return the first statement's rows.
 *
 * The same shape gallery-admin.mjs uses, including the local auto-init: a local
 * store is a sqlite file under packages/app/.wrangler that nobody else can see,
 * so a first run failing with "now type this other command" is pure friction.
 * A remote target gets the error instead — a missing table on a shared database
 * is something to look at, not something a content script should quietly fix.
 */
function d1(env, sql, { initialize = true } = {}) {
  const args = [
    'exec',
    'wrangler',
    'd1',
    'execute',
    TARGETS[env].database,
    ...storageFlags(env),
    '--json',
  ]
  let file = null
  if (sql.length > 4000) {
    file = join(mkdtempSync(join(tmpdir(), 'gallery-sequence-')), 'in.sql')
    writeFileSync(file, sql)
    args.push(`--file=${file}`)
  } else {
    args.push(`--command=${sql}`)
  }

  let stdout
  try {
    stdout = execFileSync('pnpm', args, {
      cwd: appDir,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    // Under --json wrangler reports a failed statement on STDOUT, not stderr.
    const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
    if (
      isMissingTable(output) &&
      initialize &&
      TARGETS[env].storage === 'local'
    ) {
      console.error(`Applying migrations to ${targetLabel(env)}…`)
      execFileSync('pnpm', migrationsArgs(env), {
        cwd: appDir,
        stdio: ['ignore', 'ignore', 'inherit'],
      })
      return d1(env, sql, { initialize: false })
    }
    fail(
      `wrangler d1 execute failed against ${targetLabel(env)}`,
      [
        ...tail(error.stdout),
        ...tail(error.stderr),
        `run: ${initCommand(env)}`,
      ].join('\n'),
    )
  }
  const start = stdout.indexOf('[')
  if (start < 0) fail('wrangler returned no JSON', stdout)
  const parsed = JSON.parse(stdout.slice(start))
  return parsed[0]?.results ?? []
}

/**
 * Bundle + run the TS entry point, handing it the options on stdin.
 *
 * esbuild's JS API rather than `pnpm exec esbuild` (which is what
 * seed-gallery.mjs uses): the CLI goes through `node_modules/.bin/esbuild`, a
 * shim that can be left pointing at another package manager's cache by a mixed
 * pnpm/bun install and then fails with "Cannot find module 'esbuild'". Importing
 * the package resolves the platform binary the same way the app's own build
 * does, so this works whatever installed it.
 */
async function deriveSequence(options) {
  const esbuild = await import('esbuild')
  const dir = mkdtempSync(join(tmpdir(), 'gallery-sequence-'))
  const bundle = join(dir, 'derive.mjs')
  await esbuild.build({
    entryPoints: [join(scriptDir, 'derive-sequence.entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'error',
    alias: { '@': join(appDir, 'src') },
    outfile: bundle,
  })
  const out = execFileSync('node', [bundle], {
    cwd: appDir,
    input: JSON.stringify(options),
    maxBuffer: 256 * 1024 * 1024,
  })
  return JSON.parse(out.toString())
}

/**
 * The row's stored sequence, or an empty list.
 *
 * Treats unreadable JSON as "no sequence yet" rather than failing: the column
 * is content, it can be hand-edited, and refusing to append because the OLD
 * value is malformed would leave the curator with no way to fix it from here.
 */
function readStoredSequence(raw, slug) {
  if (raw === null || raw === undefined || raw === '') return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    console.error(
      `gallery-sequence: "${slug}" had a non-array sequence — starting fresh.`,
    )
  } catch {
    console.error(
      `gallery-sequence: "${slug}" had an unreadable sequence — starting fresh.`,
    )
  }
  return []
}

/**
 * Pull one flame out of a PNG or JSON the user picked.
 *
 * Delegates to gallery-admin's `describeSource`, so a dropped file is held to
 * the SAME bar as one staged with `put` — a stripped PNG chunk, an invalid
 * descriptor or a flame needing custom variations nobody shipped are all
 * refused here rather than discovered later as a plate that renders wrong.
 */
function readFlameFromFile(path) {
  const resolved = resolve(process.cwd(), path)
  const report = describeSource(resolved)
  for (const warning of report.warnings ?? []) {
    console.error(`  warning: ${warning}`)
  }
  if (report.blocking.length > 0 || !report.flame) {
    fail(
      `cannot append ${basename(resolved)}`,
      report.blocking.map((b) => `  ${b.code}: ${b.message}`).join('\n'),
    )
  }
  console.error(
    `  ${basename(resolved)}: ${report.transformCount} transforms, ` +
      `${report.dimensions}D${report.hasAnimation ? ', animated' : ''}`,
  )
  return report.flame
}

function buildSql(slug, sequence) {
  return [
    '-- Generated by scripts/gallery-sequence.mjs — do not edit by hand.',
    '-- Regenerate with a different --seed rather than editing the JSON.',
    'UPDATE gallery_items',
    `   SET sequence = ${sequence === null ? 'NULL' : sqlStr(JSON.stringify(sequence))}`,
    ` WHERE slug = ${sqlStr(slug)};`,
    '',
  ].join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(
      readFileSync(fileURLToPath(import.meta.url), 'utf8')
        .split('\n')
        .filter((line) => line.startsWith('//'))
        .map((line) => line.replace(/^\/\/ ?/, ''))
        .join('\n'),
    )
    return
  }
  if (args.slug === null) fail('a slug is required — try --help')
  if (!SLUG.test(args.slug)) fail(`"${args.slug}" is not a servable slug`)
  if (args.apply !== null && !(args.apply in TARGETS)) {
    fail(`unknown target "${args.apply}" — expected ${TARGET_LIST}`)
  }
  // Reading the row needs a database even when only printing SQL, so a plain
  // dry run reads from local. Writing still needs --apply.
  const readEnv = args.apply ?? 'local'

  let sequence = null
  if (args.append !== null) {
    /*
     * Hand-picked entry: take the flame out of a dropped PNG/JSON and put it on
     * the end of whatever walk the row already has.
     *
     * Generated and hand-picked entries share the one flat column deliberately
     * — the player walks `[flame, ...sequence]` and does not care where an
     * entry came from, which is exactly what migration 0004 set out to allow.
     * So a curator can roll a path and then pin a specific finish onto it.
     */
    const rows = d1(
      readEnv,
      `SELECT sequence FROM gallery_items WHERE slug = ${sqlStr(args.slug)}`,
    )
    if (rows.length === 0) {
      fail(`no row with slug "${args.slug}" in ${targetLabel(readEnv)}`)
    }
    const existing = readStoredSequence(rows[0].sequence, args.slug)
    const added = readFlameFromFile(args.append)
    sequence = [...existing, added]
    console.error(
      `Appending ${basename(args.append)} to "${args.slug}" — ` +
        `${existing.length} existing entr${existing.length === 1 ? 'y' : 'ies'} ` +
        `-> ${sequence.length}.`,
    )
  } else if (!args.clear) {
    const rows = d1(
      readEnv,
      `SELECT flame FROM gallery_items WHERE slug = ${sqlStr(args.slug)}`,
    )
    if (rows.length === 0) {
      fail(`no row with slug "${args.slug}" in ${targetLabel(readEnv)}`)
    }
    const derived = await deriveSequence({
      flame: JSON.parse(rows[0].flame),
      seed: args.seed,
      paths: args.paths,
      derived: args.derived,
      roll: args.roll,
      strength: args.strength,
      mode: args.mode,
    })
    sequence = derived.sequence
    console.error(
      `Derived ${sequence.length} flame(s) for "${args.slug}" — ` +
        `${args.mode}, ${args.paths} path(s), seed ${args.seed}, ` +
        `${derived.dimensions}D.`,
    )
  }

  const sql = buildSql(args.slug, sequence)

  if (args.apply !== null) {
    d1(args.apply, sql)
    console.error(
      `${args.clear ? 'Cleared' : 'Wrote'} the sequence for "${args.slug}" in ` +
        `${targetLabel(args.apply)}.`,
    )
    return
  }
  if (args.out) {
    writeFileSync(resolve(process.cwd(), args.out), sql)
    console.error(`Wrote ${args.out}.`)
    return
  }
  process.stdout.write(sql)
}

await main()
