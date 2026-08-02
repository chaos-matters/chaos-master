#!/usr/bin/env node
// Check that every stored gallery flame is one the app will actually render.
//
//   node scripts/validate-gallery.mjs                # local
//   node scripts/validate-gallery.mjs --env dev
//   node scripts/validate-gallery.mjs --env prod
//
// Runs the app's OWN `validateFlame` against each row's descriptor and every
// entry of its curated sequence. A hand-written bounds check would only cover
// the limits someone remembered; this refuses exactly what the app refuses.
//
// Why this exists: audio modulation writes into the live descriptor, and until
// it was clamped a mapping could drive a value past its schema bound —
// `palettePhase` beyond 1, a transform probability to zero. A flame captured
// while that was happening is stored broken, and every visitor gets the error,
// not just the person who made it. This is the check to run before publishing,
// and after any incident like it.
//
// Exit code is 1 when anything is invalid, so CI or a release step can gate.
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMissingTable, storageFlags, tail, TARGET_LIST, targetLabel, TARGETS, } from './gallery-targets.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')

function fail(message, detail) {
  console.error(`validate-gallery: ${message}`)
  if (detail) console.error(detail)
  process.exit(1)
}

function parseArgs(argv) {
  const args = { env: 'local' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--env') args.env = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
    else fail(`unknown option ${argv[i]}`)
  }
  if (!TARGETS[args.env]) {
    fail(`unknown --env "${args.env}"`, `expected one of: ${TARGET_LIST}`)
  }
  return args
}

function d1(env, sql) {
  const cmdArgs = [
    'exec',
    'wrangler',
    'd1',
    'execute',
    TARGETS[env].database,
    ...storageFlags(env),
    '--json',
    `--command=${sql}`,
  ]
  let stdout
  try {
    stdout = execFileSync('pnpm', cmdArgs, {
      cwd: appDir,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
    if (isMissingTable(output)) {
      fail(`no gallery tables in ${targetLabel(env)} — nothing to validate`)
    }
    fail(
      `wrangler d1 execute failed against ${targetLabel(env)}`,
      [...tail(error.stdout), ...tail(error.stderr)].join('\n'),
    )
  }
  const start = stdout.indexOf('[')
  if (start < 0) fail('wrangler returned no JSON', stdout)
  return JSON.parse(stdout.slice(start))[0]?.results ?? []
}

/** Bundle the TS entry and run it in plain node, as the sequence tooling does. */
async function validateRows(rows) {
  const esbuild = await import('esbuild')
  const dir = mkdtempSync(join(tmpdir(), 'validate-gallery-'))
  const bundle = join(dir, 'validate.mjs')
  await esbuild.build({
    entryPoints: [join(scriptDir, 'validate-gallery.entry.ts')],
    outfile: bundle,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    alias: { '@': join(appDir, 'src') },
  })
  const stdout = execFileSync('node', [bundle], {
    input: JSON.stringify({ rows }),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  return JSON.parse(stdout).results
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(
      'Usage: node scripts/validate-gallery.mjs [--env local|dev|prod]',
    )
    return
  }

  console.error(`Reading ${targetLabel(args.env)} ...`)
  /*
   * `sequence` arrived in migration 0004, and a database that has not had it
   * applied is exactly the kind this tool exists to inspect — failing on the
   * SELECT would refuse to check the environment most likely to be broken.
   * Ask the table what it has, rather than assuming.
   */
  const columns = new Set(
    d1(args.env, 'PRAGMA table_info(gallery_items)').map((c) => c.name),
  )
  const hasSequence = columns.has('sequence')
  if (!hasSequence) {
    console.error(
      '  note: this database predates migration 0004 — no `sequence` column, ' +
        'so only the row flames are checked.',
    )
  }
  const raw = d1(
    args.env,
    `SELECT slug, flame${hasSequence ? ', sequence' : ''} ` +
      'FROM gallery_items ORDER BY slug',
  )
  const rows = raw.map((r) => ({
    slug: r.slug,
    flame: JSON.parse(r.flame),
    sequence:
      r.sequence === null || r.sequence === undefined || r.sequence === ''
        ? null
        : JSON.parse(r.sequence),
  }))
  console.error(`Validating ${rows.length} row(s) ...`)

  const results = await validateRows(rows)
  const bad = results.filter((r) => !r.ok)

  for (const r of bad) {
    console.error(`  INVALID ${r.slug} (${r.where}): ${r.message}`)
  }
  console.error(
    bad.length === 0
      ? `OK — ${results.length} flame(s) across ${rows.length} row(s) all valid.`
      : `${bad.length} of ${results.length} flame(s) INVALID.`,
  )
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: bad.length === 0,
        env: args.env,
        rows: rows.length,
        checked: results.length,
        invalid: bad,
      },
      null,
      2,
    )}\n`,
  )
  if (bad.length > 0) process.exitCode = 1
}

await main()
