#!/usr/bin/env node
// Publish captured gallery posters: upload to R2, then point the D1 rows at them.
//
// Reads the manifest written by scripts/capture-gallery-posters.mjs, uploads
// each poster into the EXISTING og-images bucket under a `gallery/` prefix, and
// sets poster_key / poster_width / poster_height / poster_frame on the matching
// gallery_items row. The Worker serves them from
// `/api/gallery/poster/<poster_key>` (it adds the `gallery/` prefix itself),
// with an immutable cache header — which is why the key carries a content hash:
// a re-capture writes a NEW key, so nothing has to be purged and no visitor is
// ever served a stale poster.
//
// poster_frame is the timeline frame an animated row's poster was frozen at.
// It travels with the key because it describes that exact image, and because
// nothing but the capture knows it: Home replays the timeline there so a live
// plate and the poster are the same picture.
//
//   node scripts/upload-gallery-posters.mjs --dry-run
//   node scripts/upload-gallery-posters.mjs --env dev
//
// Options:
//   --env local|dev|prod  which bucket + content database to write
//                         (default local: the dev bucket and database in
//                         wrangler's own local storage, nothing over the wire)
//   --in <dir>       captured posters + manifest.json
//                    (default assets/local/gallery-posters)
//   --slug a,b,c     only publish these slugs
//   --confirm prod    required with --env prod
//   --dry-run        print exactly what would be uploaded and executed
//   --help

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertPosterManifestTarget, assertPosterMatchesRow, } from './gallery-poster-manifest.mjs'
import { storageFlags, TARGET_LIST, targetLabel, TARGETS, } from './gallery-targets.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')
const repoRoot = resolve(appDir, '../..')

/** Object keys are public URL path segments — the Worker rejects anything else. */
const KEY_PATTERN = /^[a-z0-9][a-z0-9./-]{0,127}$/
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const POSTER_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

const DEFAULT_IN = join(repoRoot, 'assets/local/gallery-posters')

function parseArgs(argv) {
  // Local by default, like gallery-admin: uploading a poster is a write, and a
  // write should never reach a deployed environment unless it was asked for.
  const args = {
    env: 'local',
    in: DEFAULT_IN,
    slugs: null,
    confirm: null,
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--env') args.env = argv[++i]
    else if (arg === '--in') args.in = resolve(process.cwd(), argv[++i])
    else if (arg === '--slug')
      args.slugs = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    else if (arg === '--confirm') args.confirm = argv[++i]
    else if (arg === '--dry-run') args.dryRun = true
    else {
      console.error(`Unknown argument: ${arg}`)
      process.exit(1)
    }
  }
  return args
}

function printHelp() {
  console.log(
    readFileSync(fileURLToPath(import.meta.url), 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('//'))
      .map((line) => line.replace(/^\/\/ ?/, ''))
      .join('\n'),
  )
}

const sqlStr = (v) =>
  v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`

const sqlInt = (v) => (v === null ? 'NULL' : String(Math.trunc(v)))

/**
 * The timeline frame this poster was frozen at, for `poster_frame` — or null
 * where no frame applies.
 *
 * This is the one number the capture step computes and nothing else can
 * recover: an animated row's poster is sampled a fraction into the timeline and
 * slid off that frame when it lands on a vibrancy dip, so which frame it ended
 * up on is a decision, not a formula (see scripts/posterCapture.tsx). Home
 * replays the timeline at exactly this frame to make a live plate the same
 * image as the poster it replaces.
 *
 * Stills get null: there is no timeline to sample, and 0 would read as a real
 * frame choice. Frame 0 on an ANIMATED row is a real choice, though — a short
 * timeline can round to it — so this must not treat 0 as absent.
 */
function posterFrame(poster) {
  if (poster.animated !== true) return null
  if (!Number.isInteger(poster.frame) || poster.frame < 0) {
    throw new Error(
      `Animated poster ${poster.slug} must record a non-negative integer frame`,
    )
  }
  return poster.frame
}

function readGalleryRows(env, slugs) {
  const target = TARGETS[env]
  const sql = `SELECT slug, flame, animation FROM gallery_items WHERE slug IN (${slugs.map((slug) => sqlStr(slug)).join(', ')})`
  const stdout = execFileSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'execute',
      target.database,
      ...storageFlags(env),
      '--json',
      `--command=${sql}`,
    ],
    {
      cwd: appDir,
      maxBuffer: 64 * 1024 * 1024,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const start = stdout.indexOf('[')
  if (start < 0) throw new Error('wrangler returned no JSON')
  return JSON.parse(stdout.slice(start))[0]?.results ?? []
}

function run(command, commandArgs, dryRun) {
  if (dryRun) {
    console.log(`  would run: ${command} ${commandArgs.join(' ')}`)
    return
  }
  execFileSync(command, commandArgs, { cwd: appDir, stdio: 'inherit' })
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const target = TARGETS[args.env]
  if (!target) {
    console.error(`Unknown --env "${args.env}" — expected ${TARGET_LIST}.`)
    process.exit(1)
  }
  if (args.env === 'prod' && args.confirm !== 'prod') {
    console.error('Writing prod requires the explicit flag --confirm prod.')
    process.exit(1)
  }
  // Both halves of a poster — the object and the row that points at it — have
  // to land in the same storage, or a local row would reference an object only
  // the deployed bucket has.
  const where = storageFlags(args.env)

  const manifestPath = join(args.in, 'manifest.json')
  if (!existsSync(manifestPath)) {
    console.error(
      `No manifest at ${manifestPath} — run scripts/capture-gallery-posters.mjs first.`,
    )
    process.exit(1)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assertPosterManifestTarget(manifest, {
    env: args.env,
    storage: target.storage,
  })
  let posters = manifest.posters ?? []
  if (args.slugs) {
    const wanted = new Set(args.slugs)
    for (const slug of wanted) {
      if (!posters.some((p) => p.slug === slug)) {
        console.warn(`No captured poster for slug "${slug}"`)
      }
    }
    posters = posters.filter((p) => wanted.has(p.slug))
  }
  if (posters.length === 0) {
    console.error('Nothing to upload.')
    process.exit(1)
  }

  // Resolve every poster to its final key first, so a bad filename or a missing
  // file fails the whole run before anything is written anywhere.
  const uploads = posters.map((poster) => {
    if (!SLUG_PATTERN.test(poster.slug ?? '')) {
      throw new Error(`Refusing unsafe poster slug "${String(poster.slug)}"`)
    }
    if (
      typeof poster.file !== 'string' ||
      poster.file !== basename(poster.file)
    ) {
      throw new Error(
        `Refusing unsafe poster filename "${String(poster.file)}"`,
      )
    }
    if (!POSTER_MIME_TYPES.has(poster.mimeType)) {
      throw new Error(
        `Poster ${poster.slug} has unsupported MIME type "${String(poster.mimeType)}"`,
      )
    }
    if (
      !Number.isInteger(poster.width) ||
      poster.width <= 0 ||
      !Number.isInteger(poster.height) ||
      poster.height <= 0
    ) {
      throw new Error(
        `Poster ${poster.slug} width and height must be positive integers`,
      )
    }
    const frame = posterFrame(poster)
    const file = join(args.in, poster.file)
    if (!existsSync(file)) {
      throw new Error(
        `Manifest lists ${poster.file}, but it is not in ${args.in}`,
      )
    }
    const bytes = readFileSync(file)
    // Content hash, not a version counter: the same bytes always resolve to the
    // same key, so re-running after an unchanged capture is a no-op upload and
    // the D1 row keeps pointing at the object already cached at the edge.
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8)
    const extension = poster.file.slice(poster.file.lastIndexOf('.') + 1)
    const posterKey = `${poster.slug}-${hash}.${extension}`
    if (!KEY_PATTERN.test(posterKey)) {
      throw new Error(`Refusing to upload unsafe poster key "${posterKey}"`)
    }
    return { poster, file, bytes, frame, posterKey }
  })

  // The manifest is only a capture receipt. Re-read the selected target and
  // bind every receipt to the canonical descriptor + animation currently in
  // D1 before the first R2 object or D1 pointer is written.
  const rows = readGalleryRows(
    args.env,
    uploads.map(({ poster }) => poster.slug),
  )
  const rowsBySlug = new Map(rows.map((row) => [row.slug, row]))
  for (const { poster } of uploads) {
    const row = rowsBySlug.get(poster.slug)
    if (!row) {
      throw new Error(`No gallery row exists for poster ${poster.slug}`)
    }
    assertPosterMatchesRow(poster, row)
  }

  console.log(
    `${args.dryRun ? '[dry run] ' : ''}Publishing ${uploads.length} poster(s) ` +
      `to ${target.bucket} and ${targetLabel(args.env)}`,
  )

  for (const { poster, file, bytes, frame, posterKey } of uploads) {
    console.log(
      `${poster.slug} -> gallery/${posterKey} ` +
        `(${(bytes.length / 1024).toFixed(0)} KiB, ${poster.width}x${poster.height}` +
        `${frame === null ? '' : `, frame ${frame}`})`,
    )
    run(
      'pnpm',
      [
        'exec',
        'wrangler',
        'r2',
        'object',
        'put',
        `${target.bucket}/gallery/${posterKey}`,
        `--file=${file}`,
        `--content-type=${poster.mimeType}`,
        // Objects are immutable (content-hashed key), so let the edge and the
        // browser hold on to them.
        '--cache-control=public, max-age=31536000, immutable',
        ...where,
      ],
      args.dryRun,
    )
  }

  // One statement per row, in a single file: D1 runs it as one batch, so the
  // gallery never sits half-updated.
  const sql = [
    '-- Generated by scripts/upload-gallery-posters.mjs — do not edit by hand.',
    '',
    ...uploads.map(
      ({ poster, frame, posterKey }) =>
        `UPDATE gallery_items SET poster_key = ${sqlStr(posterKey)}, ` +
        `poster_width = ${poster.width}, poster_height = ${poster.height}, ` +
        // Written in the same statement as the key on purpose: the frame
        // describes THAT poster, so a row must never carry one without the
        // other, in either direction.
        `poster_frame = ${sqlInt(frame)} ` +
        `WHERE slug = ${sqlStr(poster.slug)};`,
    ),
    '',
  ].join('\n')

  if (args.dryRun) {
    console.log('\n[dry run] SQL that would be executed:\n')
    console.log(sql)
    return
  }

  const dir = mkdtempSync(join(tmpdir(), 'gallery-posters-'))
  const sqlFile = join(dir, 'posters.sql')
  try {
    writeFileSync(sqlFile, sql)
    run(
      'pnpm',
      [
        'exec',
        'wrangler',
        'd1',
        'execute',
        target.database,
        ...where,
        `--file=${sqlFile}`,
      ],
      false,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  console.log(
    `\nPublished ${uploads.length} poster(s) to ${args.env} ` +
      `(${target.storage} storage).`,
  )
}

main()
