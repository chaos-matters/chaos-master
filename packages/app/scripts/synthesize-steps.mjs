#!/usr/bin/env node
/**
 * synthesize-steps — turn a finished flame into a creation you can replay.
 *
 * Every flame PNG the app has ever exported carries its descriptor; almost
 * none carries recorded steps, so the Replay panel has nothing to play. This
 * plans a plausible one — start from the app's default flame and add one thing
 * at a time until the document equals the target — and writes it as a bare
 * `.steps.json`, which is a file the app's existing loader already accepts:
 * drop it on the canvas and press Replay.
 *
 * The session it writes is marked synthetic, so the app says "a possible way
 * to build this" rather than claiming it is how the flame was made.
 *
 *   node scripts/synthesize-steps.mjs flame.png
 *   node scripts/synthesize-steps.mjs flame.png --strategy layered --seed 3
 *   node scripts/synthesize-steps.mjs a.png b.png --strategy perTransform,sculpt --out-dir ./steps
 *   node scripts/synthesize-steps.mjs --manifest selection.json --out-dir ./steps
 *
 * Options
 *   --strategy <list>  perTransform | layered | sculpt | surprise (comma list)
 *   --seed <n>         PRNG seed; the same seed always plans the same journey
 *   --hold-ms <n>      how long replay holds on each step (default 700)
 *   --max-steps <n>    cap before the closing snap
 *   --colour-first     put colour before shape wherever the strategy is free
 *   --out <file>       write one session here (single input, single strategy)
 *   --out-dir <dir>    write <name>.<strategy>.steps.json per input/strategy.
 *                      With neither, each session is written BESIDE ITS INPUT
 *                      FLAME — which for a dropped PNG means your Pictures or
 *                      downloads folder, so pass one of the two.
 *   --created-at <iso> fixed timestamp, so a rerun is byte-identical
 *   --manifest <file>  a JSON array of { name?, path } to use as the inputs
 *   --json             print the machine-readable report instead of a summary
 *
 * Bundles a tiny TS entry with esbuild and runs it in plain node, the same way
 * gallery-sequence.mjs does — no browser and no GPU are involved.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')

const STRATEGIES = ['perTransform', 'layered', 'sculpt', 'surprise']

function fail(message, detail) {
  console.error(`synthesize-steps: ${message}`)
  if (detail) console.error(detail)
  process.exit(1)
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    strategies: ['perTransform'],
    seed: 1,
    json: false,
  }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (value === undefined) fail(`${arg} needs a value`)
      return value
    }
    switch (arg) {
      case '--strategy':
        options.strategies = next()
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
        break
      case '--seed':
        options.seed = Number(next())
        break
      case '--hold-ms':
        options.holdMs = Number(next())
        break
      case '--max-steps':
        options.maxSteps = Number(next())
        break
      case '--colour-first':
      case '--color-first':
        options.colourFirst = true
        break
      case '--out':
        options.out = resolve(process.cwd(), next())
        break
      case '--out-dir':
        options.outDir = resolve(process.cwd(), next())
        break
      case '--created-at':
        options.createdAt = next()
        break
      case '--manifest':
        options.manifest = resolve(process.cwd(), next())
        break
      case '--json':
        options.json = true
        break
      case '-h':
      case '--help':
        printUsage()
        process.exit(0)
        break
      default:
        if (arg.startsWith('--')) fail(`unknown option ${arg}`)
        options.inputs.push(resolve(process.cwd(), arg))
    }
  }
  return options
}

function printUsage() {
  console.log(
    [
      'Usage: node scripts/synthesize-steps.mjs <flame.png|descriptor.json>... [options]',
      '',
      '  --strategy <list>  perTransform | layered | sculpt | surprise (comma list)',
      '  --seed <n>         PRNG seed (default 1)',
      '  --hold-ms <n>      hold per step in ms (default 700)',
      '  --max-steps <n>    cap before the closing snap',
      '  --colour-first     colour before shape where the strategy is free',
      '  --out <file>       write one session to this path',
      '  --out-dir <dir>    write <name>.<strategy>.steps.json per result',
      '                     (default: beside each input flame)',
      '  --created-at <iso> fixed timestamp for reproducible files',
      '  --manifest <file>  JSON array of { name?, path } to use as inputs',
      '  --json             print the machine-readable report',
    ].join('\n'),
  )
}

/**
 * A manifest is a list of flames someone already curated (the marketing
 * selection, a gallery sequence). Accepting one means the batch that turns a
 * folder of PNGs into replayable creations is this script plus a path, not a
 * shell loop that re-bundles the planner once per file.
 */
function readManifest(path) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`could not read manifest ${path}`, String(error))
  }
  if (!Array.isArray(parsed)) fail(`manifest ${path} is not an array`)
  const entries = []
  for (const entry of parsed) {
    const flamePath = typeof entry === 'string' ? entry : entry?.path
    if (typeof flamePath !== 'string' || flamePath === '') {
      fail(`manifest entry has no path: ${JSON.stringify(entry)}`)
    }
    entries.push({
      path: resolve(dirname(path), flamePath),
      name: typeof entry?.name === 'string' ? entry.name : undefined,
    })
  }
  return entries
}

/**
 * Bundle + run the TS entry point, handing it the options on stdin.
 *
 * esbuild's JS API rather than `pnpm exec esbuild`: the CLI goes through
 * `node_modules/.bin/esbuild`, a shim a mixed pnpm/bun install can leave
 * pointing at another package manager's cache. Importing the package resolves
 * the platform binary the way the app's own build does.
 */
/**
 * `import.meta.env`, which esbuild has no notion of.
 *
 * Vite's four own fields and nothing else. The planner reaches
 * `src/defaults.ts` through the command registry and that module reads
 * `import.meta.env.VITE_*` at import time, but every one of those values is a
 * rendering default — point counts, preview qualities, a Turnstile site key —
 * and a planned session contains none of them. Verified rather than assumed:
 * the sessions this writes are byte-identical with and without the file.
 *
 * So the app's `.env` is NOT read. It used to be inlined wholesale into a
 * bundle in `$TMPDIR` that nothing deleted, which is a habit that only has to
 * meet `.env.local` once to leave a secret on disk. If the bundle ever does
 * need a variable, define that one variable here and say which and why.
 */
function viteEnv() {
  return { DEV: false, PROD: true, MODE: 'production', BASE_URL: '/' }
}

/**
 * Run `fn` with a scratch directory, and take the directory away afterwards.
 *
 * The bundle written into it is a full copy of the planner and everything it
 * imports — a few megabytes per run. It is scratch, so it goes whether the run
 * succeeded, threw, or was interrupted at the terminal.
 */
export async function withBundleDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'synthesize-steps-'))
  const remove = () => {
    rmSync(dir, { recursive: true, force: true })
  }
  const onSignal = () => {
    remove()
    process.exit(130)
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  try {
    return await fn(dir)
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    remove()
  }
}

async function runPlanner(payload) {
  const esbuild = await import('esbuild')
  return withBundleDir(async (dir) => {
    const bundle = join(dir, 'synthesize.mjs')
    await esbuild.build({
      entryPoints: [join(scriptDir, 'synthesize-steps.entry.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      logLevel: 'error',
      alias: { '@': join(appDir, 'src') },
      define: {
        'import.meta.env': '__SYNTHESIZE_ENV__',
        __GIT_SHA__: '"synthesize-steps"',
        // `src/version.ts` reads it at module scope and the planner stamps the
        // app version into every session, so leaving it out made the bundle
        // throw `__NATIVE_BUILD__ is not defined` before it read a flame.
        __NATIVE_BUILD__: 'false',
      },
      banner: {
        js: [
          `const __SYNTHESIZE_ENV__ = ${JSON.stringify(viteEnv())};`,
          // The app mints entity ids with `window.crypto.randomUUID()`, and
          // some of its modules do so while they load. Node has the same
          // `crypto` on `globalThis`; this is the one browser assumption the
          // bundle needs.
          'globalThis.window ??= globalThis;',
        ].join('\n'),
      },
      outfile: bundle,
    })
    // Child stderr goes straight to the terminal: a planner that throws should
    // print the stack, not a Buffer dump of it inside an execFileSync error.
    const out = execFileSync('node', [bundle], {
      cwd: appDir,
      input: JSON.stringify(payload),
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'inherit'],
    })
    return JSON.parse(out.toString())
  })
}

/** A label turned into a file name: one path segment, and nothing else. */
export function safeName(name) {
  return name.replace(/[^\w-]+/g, '_')
}

/** True when `target` is `dir` itself or something underneath it. */
export function isInside(dir, target) {
  const rel = relative(resolve(dir), target)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Where one result is written.
 *
 * A manifest is data someone else may have written, and its `name` is a label,
 * not a path: it goes through the same sanitiser as the basename fallback, so
 * `../../x` and `/etc/passwd` both flatten to one segment. The containment
 * check after resolving is deliberately redundant — it states the property the
 * sanitiser is there for, so an edit to that pattern cannot quietly lose it.
 *
 * An explicit `--out` is exempt: that path is the caller's own instruction.
 */
export function outputPath(options, result, names) {
  if (options.out !== undefined) return options.out
  const base = safeName(
    names.get(result.input) ?? basename(result.input, extname(result.input)),
  )
  const dir = options.outDir ?? dirname(result.input)
  const target = resolve(dir, `${base}.${result.strategy}.steps.json`)
  if (!isInside(dir, target)) {
    fail(`refusing to write ${target}: outside ${resolve(dir)}`)
  }
  return target
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const names = new Map()
  if (options.manifest !== undefined) {
    for (const entry of readManifest(options.manifest)) {
      options.inputs.push(entry.path)
      if (entry.name !== undefined) names.set(entry.path, entry.name)
    }
  }
  if (options.inputs.length === 0) {
    printUsage()
    fail('no input flames')
  }
  const unknown = options.strategies.filter((s) => !STRATEGIES.includes(s))
  if (unknown.length > 0) {
    fail(
      `unknown strategy ${unknown.join(', ')} (use ${STRATEGIES.join(', ')})`,
    )
  }
  if (
    options.out !== undefined &&
    (options.inputs.length > 1 || options.strategies.length > 1)
  ) {
    fail('--out writes one file; use --out-dir for more than one result')
  }

  const { results } = await runPlanner({
    inputs: options.inputs,
    strategies: options.strategies,
    seed: options.seed,
    ...(options.colourFirst === undefined
      ? {}
      : { colourFirst: options.colourFirst }),
    ...(options.maxSteps === undefined ? {} : { maxSteps: options.maxSteps }),
    ...(options.holdMs === undefined ? {} : { holdMs: options.holdMs }),
    ...(options.createdAt === undefined
      ? {}
      : { createdAt: options.createdAt }),
  })

  const written = []
  let failures = 0
  for (const result of results) {
    if (result.session === undefined || !result.ok) {
      failures++
      console.error(
        `  ${basename(result.input)} [${result.strategy}]: ${result.error ?? 'could not be planned'}`,
      )
      continue
    }
    const target = outputPath(options, result, names)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, `${JSON.stringify(result.session, null, 2)}\n`)
    written.push({ ...result, target })
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          written: written.map(
            ({ input, strategy, steps, snapped, residual, target }) => ({
              input,
              strategy,
              steps,
              snapped,
              residual,
              target,
            }),
          ),
          failures,
        },
        null,
        2,
      ),
    )
  } else {
    for (const result of written) {
      console.log(
        `  ${basename(result.target)} — ${result.steps} steps${
          result.snapped
            ? `, ends with a snap (${result.residual.slice(0, 3).join(', ')})`
            : ', exact'
        }`,
      )
    }
    console.log(
      `synthesize-steps: wrote ${written.length} session(s)${
        failures > 0 ? `, ${failures} failed` : ''
      }`,
    )
  }
  if (failures > 0) process.exitCode = 1
}

// Only when run, not when imported: the helpers above are unit-tested, and
// importing this file to reach them must not plan anything.
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main()
}
