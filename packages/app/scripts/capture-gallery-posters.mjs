#!/usr/bin/env node
// Capture still posters for the Home tab's gallery rows.
//
// Home renders every gallery flame live on the GPU. Visitors without WebGPU —
// and every visitor for the second or two before a flame converges — get a
// poster instead. This script produces those posters from the SAME rows Home
// reads, rendered by the REAL Flam3 renderer, so a poster and its live flame
// are the same image.
//
// It drives the dev-only page at scripts/poster-capture.html through a HEADED
// Chromium: headless has no usable WebGPU on this machine, so a headless run
// would silently produce black plates (see [[webgpu-verify-headed-playwright]]).
// The page renders with the app's own export driver and only hands the image
// back once `finalImageReady` is true — the same gate the PNG export uses — so
// a poster is never a half-accumulated, noisy frame.
//
//   cd packages/app && pnpm start            # HTTPS dev server on :5173
//   node scripts/capture-gallery-posters.mjs
//
// Options:
//   --env local|dev|prod  content database to read rows from (default local:
//                         the dev database in wrangler's own local storage)
//   --slug a,b,c          only these slugs (re-do a few without a full sweep)
//   --section <name>      only this section (hero|gallery|motion|capability)
//   --include-unpublished also capture rows with published = 0. Staged rows
//                         (scripts/gallery-admin.mjs put) need a poster BEFORE
//                         they go live, and they are unpublished by definition.
//   --out <dir>           output directory
//                         (default assets/local/gallery-posters, gitignored)
//   --base <url>          dev server origin (default https://localhost:5173)
//   --size <px>           long edge of the poster (default 1600)
//   --aspect <w:h>        poster aspect ratio (default 16:9)
//   --format webp|jpeg    output format (default webp; WEBP is ~35% smaller
//                         than JPEG at matching quality on these images)
//   --encode-quality <q>  encoder quality 0..1 (default 0.9)
//   --quality <q>         Flam3 convergence target 0..1 (default 0.97)
//   --points <n>          points per batch (default 1000000)
//   --frame-fraction <f>  where to sample an animated row (default 0.35). The
//                         capture page slides off that frame when the timeline
//                         has vibrancy below the flame's stored value there,
//                         so a poster is never the greyed-out moment of a
//                         colour animation — see scripts/posterCapture.tsx.
//                         Whichever frame that resolves to is recorded in the
//                         manifest and stored on the row as `poster_frame`, so
//                         Home can render the same image live.
//   --frame <n>           explicit timeline frame; overrides --frame-fraction
//                         and the vibrancy check both
//   --timeout <ms>        per-row render budget (default 240000)
//   --keep-open           leave the browser open after the run (for debugging)
//   --skip-checkout-check don't verify that --base serves THIS checkout. Only
//                         for when the check itself is broken — see
//                         scripts/dev-server-checkout.mjs
//   --help
//
// Before anything else the run checks that whatever answers --base is serving
// THIS checkout, and refuses to continue otherwise: a dev server from another
// worktree serves the capture page just as happily and silently renders posters
// from its own code. See scripts/dev-server-checkout.mjs.
//
// Output is <out>/<slug>.<ext> plus a manifest.json that
// scripts/upload-gallery-posters.mjs consumes.

import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CAPTURE_PAGE, checkoutFailure, verifyServedCheckout, } from './dev-server-checkout.mjs'
import { galleryContentDigest, mergePosterManifestEntries, POSTER_MANIFEST_VERSION, } from './gallery-poster-manifest.mjs'
import { couldNotRun, couldNotRunLines, initCommand, isMissingTable, storageFlags, TARGET_LIST, targetLabel, TARGETS, } from './gallery-targets.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')
const repoRoot = resolve(appDir, '../..')

const MIME = { webp: 'image/webp', jpeg: 'image/jpeg' }
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }

const DEFAULTS = {
  // Local by default, matching gallery-admin: a capture run should read the
  // rows you are curating on this machine, not a deployed environment's.
  env: 'local',
  out: join(repoRoot, 'assets/local/gallery-posters'),
  base: 'https://localhost:5173',
  size: 1600,
  // The flames were authored in the app's landscape viewport, and Camera2D
  // keeps the vertical extent fixed while widening horizontally — so a square
  // capture CROPS the authored composition, while 16:9 shows all of it. A
  // squarer plate can always crop a wide poster in CSS; nothing can uncrop.
  aspect: '16:9',
  format: 'webp',
  encodeQuality: 0.9,
  // Flam3's live quality is 1 - sqrt(bucketProbabilityInv / points), so it
  // approaches 1 asymptotically: 0.97 is ~1100x the bucket count, the same
  // convergence the landing's posters wait for, and visually clean.
  quality: 0.97,
  points: 1_000_000,
  // Frame 0 of an animated row is its rest pose — usually the least
  // interesting thing the timeline does. A third of the way in has the camera
  // moved, the morph underway and the loop not yet back at the start. Where
  // that lands on a vibrancy dip the capture page slides off it, so this stays
  // a preference rather than a promise.
  frameFraction: 0.35,
  frame: null,
  timeout: 240_000,
}

function parseArgs(argv) {
  const args = {
    ...DEFAULTS,
    slugs: null,
    section: null,
    includeUnpublished: false,
    keepOpen: false,
    skipCheckoutCheck: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--env') args.env = argv[++i]
    else if (arg === '--slug')
      args.slugs = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    else if (arg === '--section') args.section = argv[++i]
    else if (arg === '--include-unpublished') args.includeUnpublished = true
    else if (arg === '--out') args.out = resolve(process.cwd(), argv[++i])
    else if (arg === '--base') args.base = argv[++i].replace(/\/$/, '')
    else if (arg === '--size') args.size = Number(argv[++i])
    else if (arg === '--aspect') args.aspect = argv[++i]
    else if (arg === '--format') args.format = argv[++i]
    else if (arg === '--encode-quality') args.encodeQuality = Number(argv[++i])
    else if (arg === '--quality') args.quality = Number(argv[++i])
    else if (arg === '--points') args.points = Number(argv[++i])
    else if (arg === '--frame-fraction') args.frameFraction = Number(argv[++i])
    else if (arg === '--frame') args.frame = Number(argv[++i])
    else if (arg === '--timeout') args.timeout = Number(argv[++i])
    else if (arg === '--keep-open') args.keepOpen = true
    else if (arg === '--skip-checkout-check') args.skipCheckoutCheck = true
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

/**
 * Merge this run's entries into a same-version, same-target manifest in `out`,
 * keyed on slug. Re-capturing a few rows with --slug must not drop the rest of
 * that gallery; entries from another env/storage must never be relabelled as
 * belonging to this run.
 */
function mergeManifest(out, entries, target) {
  const path = join(out, 'manifest.json')
  const existing = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : null
  return mergePosterManifestEntries(existing, entries, target)
}

/** Resolve `--size` + `--aspect` to exact even pixel dimensions. */
function resolveDimensions(size, aspect) {
  const [w, h] = aspect.split(':').map(Number)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error(`Invalid --aspect "${aspect}" — expected w:h, e.g. 16:9`)
  }
  const even = (n) => {
    const r = Math.max(2, Math.round(n))
    return r % 2 === 0 ? r : r + 1
  }
  const ratio = w / h
  return ratio >= 1
    ? { width: even(size), height: even(size / ratio) }
    : { width: even(size * ratio), height: even(size) }
}

/** Read the published rows straight out of D1 — the same rows Home serves. */
function readRows(env, section, includeUnpublished) {
  const target = TARGETS[env]
  if (!target) {
    throw new Error(`Unknown --env "${env}" — expected ${TARGET_LIST}.`)
  }
  const clauses = includeUnpublished ? [] : ['published = 1']
  if (section !== null) {
    clauses.push(`section = '${section.replace(/'/g, "''")}'`)
  }
  const where = clauses.length === 0 ? '1 = 1' : clauses.join(' AND ')
  const sql =
    'SELECT slug, title, section, flame, animation FROM gallery_items ' +
    `WHERE ${where} ORDER BY section, sort_order, slug`
  let stdout
  try {
    stdout = execFileSync(
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
  } catch (error) {
    // First: a child that never started has no output, so the branches below
    // would blame the schema for a `pnpm` that is not on PATH.
    if (couldNotRun(error)) {
      const why = couldNotRunLines('pnpm', error)
        .map((line) => `  ${line}`)
        .join('\n')
      throw new Error(
        `Could not run \`pnpm\` — nothing was read from ${targetLabel(env)}:\n${why}`,
      )
    }
    // Under --json the failure comes back on stdout. An empty target is the
    // one failure worth naming: it means the schema is missing, not that the
    // gallery is empty, and gallery-admin is what creates it.
    const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
    if (isMissingTable(output)) {
      throw new Error(
        `${targetLabel(env)} has no gallery_items table. Create it with:\n` +
          `  cd packages/app && ${initCommand(env)}\n` +
          `(or just run \`node scripts/gallery-admin.mjs list --env ${env}\`, ` +
          'which does it for a local target)',
      )
    }
    throw new Error(
      `wrangler d1 execute failed against ${targetLabel(env)}:\n${output.trim()}`,
    )
  }
  // wrangler prints its banner on stderr, but slice from the first bracket
  // anyway so a future banner change cannot break the parse.
  const start = stdout.indexOf('[')
  if (start < 0) throw new Error('wrangler returned no JSON')
  const parsed = JSON.parse(stdout.slice(start))
  return parsed[0]?.results ?? []
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const dimensions = resolveDimensions(args.size, args.aspect)
  const mimeType = MIME[args.format]
  if (!mimeType) {
    console.error(`Unknown --format "${args.format}" — expected webp or jpeg.`)
    process.exit(1)
  }

  // Before the database read and long before Chromium: the one thing that makes
  // a whole run worthless without leaving a trace in its output is a dev server
  // belonging to a different worktree.
  const checkout = await verifyServedCheckout({ base: args.base, appDir })
  if (checkout.verdict === 'unreachable') {
    console.error(
      `Nothing is serving ${args.base}${CAPTURE_PAGE} ` +
        `(HTTP ${checkout.status}).\nStart it with: cd ${appDir} && pnpm start`,
    )
    process.exit(1)
  }
  const failure = checkoutFailure({ base: args.base, appDir, result: checkout })
  const waived =
    failure !== null && failure.bypassable && args.skipCheckoutCheck
  if (failure !== null && !waived) {
    console.error(failure.message)
    process.exit(1)
  }
  console.log(
    waived
      ? `Dev server at ${args.base}: checkout unverified, continuing on --skip-checkout-check`
      : `Dev server at ${args.base} serves this checkout (${appDir}, via ${checkout.via})`,
  )

  let rows = readRows(args.env, args.section, args.includeUnpublished)
  if (args.slugs) {
    const wanted = new Set(args.slugs)
    const found = new Set(rows.map((r) => r.slug))
    const qualifier = args.includeUnpublished ? '' : 'published '
    for (const slug of wanted) {
      if (!found.has(slug)) {
        console.warn(`No ${qualifier}row for slug "${slug}"`)
      }
    }
    rows = rows.filter((r) => wanted.has(r.slug))
  }
  if (rows.length === 0) {
    console.error('Nothing to capture.')
    process.exit(1)
  }

  mkdirSync(args.out, { recursive: true })
  console.log(
    `Capturing ${rows.length} poster(s) at ${dimensions.width}x${dimensions.height} ` +
      `(${args.format}, quality ${args.quality}) from ${targetLabel(args.env)}`,
  )

  // Headed, with the same WebGPU flags the repo's GPU e2e config uses. Headless
  // Chromium has no usable WebGPU here and would write black posters.
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan',
      '--ignore-gpu-blocklist',
    ],
  })
  // ignoreHTTPSErrors: the dev server runs over HTTPS with a self-signed cert
  // (basic-ssl); without this Playwright refuses to load the capture page.
  const context = await browser.newContext({
    viewport: { width: 900, height: 700 },
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  page.on('console', (msg) => {
    const text = msg.text()
    if (msg.type() === 'error' || text.includes('WebGPU')) {
      console.log(`  [page] ${text}`)
    }
  })
  page.on('pageerror', (err) => {
    console.log(`  [page] ${err.message}`)
  })

  const url = `${args.base}${CAPTURE_PAGE}`
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
  await page.waitForFunction(() => '__posterCapture' in window, undefined, {
    timeout: 60_000,
  })

  const manifest = []
  let failures = 0

  for (const row of rows) {
    process.stdout.write(`capturing ${row.slug} ... `)
    const startedAt = Date.now()
    try {
      const contentDigest = galleryContentDigest(row.flame, row.animation)
      const spec = {
        slug: row.slug,
        flame: JSON.parse(row.flame),
        animation: row.animation === null ? null : JSON.parse(row.animation),
        width: dimensions.width,
        height: dimensions.height,
        quality: args.quality,
        pointCountPerBatch: args.points,
        frame: args.frame,
        frameFraction: args.frameFraction,
        mimeType,
        encodeQuality: args.encodeQuality,
      }
      const placement = await page.evaluate(
        (s) => window.__posterCapture.load(s),
        spec,
      )
      await page.waitForFunction(
        () => {
          const status = window.__posterCapture.status()
          if (status.state === 'error') throw new Error(status.error)
          return status.state === 'done'
        },
        undefined,
        { timeout: args.timeout, polling: 500 },
      )
      const result = await page.evaluate(() => window.__posterCapture.take())
      if (!result) throw new Error('capture page returned no image')
      if (result.peak <= 2) {
        throw new Error(
          `poster is blank (peak channel ${result.peak}) — the canvas was not drawn`,
        )
      }

      const ext = EXT[result.mimeType] ?? 'bin'
      const file = `${row.slug}.${ext}`
      const bytes = Buffer.from(result.base64, 'base64')
      writeFileSync(join(args.out, file), bytes)

      const entry = {
        slug: row.slug,
        title: row.title,
        section: row.section,
        file,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
        bytes: bytes.length,
        animated: row.animation !== null,
        // Which frame this poster IS. upload-gallery-posters.mjs copies it into
        // `poster_frame`, and Home replays the timeline there so a live plate
        // renders the same image the poster shows. Nothing downstream can
        // recompute it: see resolveFrame in scripts/posterCapture.tsx.
        frame: result.frame,
        endFrame: result.endFrame,
        // Mean saturation of the lit pixels. A near-zero value on a flame that
        // is not grey means the poster lost the flame's colour — the failure
        // this number exists to make visible.
        saturation: Number(result.saturation.toFixed(3)),
        quality: args.quality,
        contentDigest,
        capturedAt: new Date().toISOString(),
      }
      manifest.push(entry)

      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
      const frameNote =
        row.animation === null
          ? ''
          : ` frame ${placement.frame}/${placement.endFrame}`
      console.log(
        `ok -> ${file} ${(bytes.length / 1024).toFixed(0)} KiB ` +
          `${result.width}x${result.height}${frameNote} ` +
          `sat ${result.saturation.toFixed(2)} in ${seconds}s`,
      )
    } catch (err) {
      failures += 1
      console.log(`FAILED: ${err.message}`)
    }
  }

  if (manifest.length > 0) {
    writeFileSync(
      join(args.out, 'manifest.json'),
      `${JSON.stringify(
        {
          manifestVersion: POSTER_MANIFEST_VERSION,
          env: args.env,
          // local and dev name the same database, so the manifest has to say
          // which storage these posters were rendered from.
          storage: TARGETS[args.env].storage,
          format: args.format,
          dimensions,
          capturedAt: new Date().toISOString(),
          posters: mergeManifest(args.out, manifest, {
            env: args.env,
            storage: TARGETS[args.env].storage,
          }),
        },
        null,
        2,
      )}\n`,
    )
    console.log(`\nWrote ${manifest.length} poster(s) to ${args.out}`)
  }

  if (!args.keepOpen) await browser.close()
  if (failures > 0) {
    console.error(`${failures} poster(s) failed.`)
    process.exit(1)
  }
}

await main()
