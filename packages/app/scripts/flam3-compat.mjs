#!/usr/bin/env node
// Batch-audit flam3/Apophysis XML with the application's real importer.
import { Window } from 'happy-dom'
import { Buffer } from 'node:buffer'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve, sep, } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')
const VALID_EXTENSIONS = new Set(['.flame', '.xml'])

function fail(message) {
  console.error(`flam3-compat: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const args = { paths: [], json: false, strict: false, help: false }
  for (const arg of argv) {
    if (arg === '--json') args.json = true
    else if (arg === '--strict') args.strict = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else if (arg.startsWith('-')) fail(`unknown option ${arg}`)
    else args.paths.push(arg)
  }
  return args
}

function collectFiles(inputPath, files) {
  const absolute = resolve(inputPath)
  if (!existsSync(absolute)) fail(`path does not exist: ${inputPath}`)

  const stat = statSync(absolute)
  if (stat.isDirectory()) {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.isDirectory() || entry.isFile()) {
        collectFiles(join(absolute, entry.name), files)
      }
    }
    return
  }

  if (stat.isFile() && VALID_EXTENSIONS.has(extname(absolute).toLowerCase())) {
    files.add(absolute)
  }
}

function displayPath(path) {
  const fromCwd = relative(process.cwd(), path)
  const readable = fromCwd.startsWith(`..${sep}`)
    ? path
    : fromCwd || basename(path)
  return readable.split(sep).join('/')
}

async function analyze(inputs, strict) {
  const esbuild = await import('esbuild')
  const tempDir = mkdtempSync(join(tmpdir(), 'flam3-compat-'))
  const bundle = join(tempDir, 'compatibility.mjs')
  const browserWindow = new Window({ url: 'https://lumen.local/' })
  try {
    await esbuild.build({
      entryPoints: [join(appDir, 'src/flame/flameXmlCompatibility.ts')],
      outfile: bundle,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      logLevel: 'silent',
      alias: { '@': join(appDir, 'src') },
    })
    // The importer is browser code. Supply its DOM boundary before evaluating
    // the bundle; Happy DOM is an in-process parser, not a browser process.
    globalThis.window = browserWindow
    globalThis.document = browserWindow.document
    globalThis.DOMParser = browserWindow.DOMParser
    globalThis.localStorage = browserWindow.localStorage
    const module = await import(pathToFileURL(bundle).href)
    const report = module.analyzeFlameXmlBatch(inputs)
    return {
      report,
      failed: module.flameXmlCompatibilityFailed(report, strict),
    }
  } finally {
    browserWindow.close()
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function printHuman(report) {
  console.log(
    `FLAM3 compatibility · ${report.summary.flames} flame(s) in ${report.summary.files} file(s)`,
  )
  for (const file of report.files) {
    const marker =
      file.status === 'importable'
        ? '✓'
        : file.status === 'importable-with-loss'
          ? '△'
          : '×'
    console.log(`\n${marker} ${file.path} · ${file.bytes} bytes`)
    for (const diagnostic of file.diagnostics) {
      console.log(`  ${diagnostic}`)
    }
    for (const flame of file.flames) {
      const flameMarker =
        flame.status === 'importable'
          ? '✓'
          : flame.status === 'importable-with-loss'
            ? '△'
            : '×'
      const metrics =
        flame.transformCount === undefined
          ? ''
          : ` · ${flame.transformCount} transforms · ${flame.variationCount} variations`
      console.log(`  ${flameMarker} ${flame.name}${metrics}`)
      for (const diagnostic of flame.diagnostics) {
        console.log(`    ${diagnostic}`)
      }
    }
  }

  console.log(
    `\n${report.summary.importable} importable · ` +
      `${report.summary.importableWithLoss} with loss · ` +
      `${report.summary.invalid} invalid ` +
      `(${report.summary.invalidFlames} flames, ${report.summary.invalidFiles} files)`,
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`Usage: pnpm flam3:compat [--json] [--strict] <file-or-directory> [...]

Recursively checks .flame and .xml files with the same parser used by the app.
--json    Print the stable, machine-readable report.
--strict  Also exit 1 when an import is usable but lossy.`)
    return
  }
  if (args.paths.length === 0) fail('provide at least one file or directory')

  const files = new Set()
  for (const inputPath of args.paths) collectFiles(inputPath, files)
  if (files.size === 0) fail('no .flame or .xml files found')

  const inputs = [...files].sort().map((path) => {
    const xml = readFileSync(path, 'utf8')
    return { path: displayPath(path), xml, bytes: Buffer.byteLength(xml) }
  })
  const { report, failed } = await analyze(inputs, args.strict)

  if (args.json) console.log(JSON.stringify(report, null, 2))
  else printHuman(report)

  if (failed) process.exitCode = 1
}

await main()
