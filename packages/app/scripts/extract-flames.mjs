#!/usr/bin/env node
/**
 * Extract the flame descriptors the app embeds into exported PNGs so they can
 * be seeded into a content database.
 *
 * Every PNG the app exports carries a deflate-compressed `zTXt` chunk keyed
 * `FlameJson` (written by packages/app/src/utils/flameInPng.ts). Two envelope
 * shapes exist in the wild:
 *
 *   still export      bare descriptor: { metadata, renderSettings, transforms }
 *   animated export   { flame: <descriptor>, animation: { tracks, config } }
 *
 * Either may also carry a top-level `version`. Both are normalized here to a
 * single shape — `{ flame, animation }`, with `animation: null` for stills —
 * so downstream seeding never has to special-case the source.
 *
 * Flames are validated structurally (required keys, non-empty transforms,
 * well-formed affines) rather than against the valibot schema in
 * packages/app/src/flame/schema/flameSchema.ts, which is TypeScript and would
 * drag the whole app module graph into a plain `node` run. Anything that fails
 * is reported and NOT written; softer problems are recorded as warnings on the
 * manifest entry.
 *
 * Usage:
 *   node packages/app/scripts/extract-flames.mjs [input-dir] [output-dir]
 *   node packages/app/scripts/extract-flames.mjs --help
 *
 * No dependencies — node:fs, node:path, node:zlib, node:crypto, node:util.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { inflateSync } from 'node:zlib'

const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(scriptDir, '../../..')

// Defaults are only a convenience — the export drop and the seed target are
// both expected to be passed explicitly in practice.
const DEFAULT_INPUT = resolve(repoRoot, 'assets/flame-exports')
const DEFAULT_OUTPUT = resolve(scriptDir, 'extracted-flames')

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PNG_HEADER_BYTES = 8
const CHUNK_LENGTH_BYTES = 4
const CHUNK_TYPE_BYTES = 4
const CHUNK_CRC_BYTES = 4
const CHUNK_KEYWORD = 'FlameJson'
const COMPRESSION_DEFLATE = 0x00

// ── CLI ──────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`extract-flames — pull embedded flame descriptors out of exported PNGs

Usage:
  node packages/app/scripts/extract-flames.mjs [input-dir] [output-dir]

Options:
  -i, --input <dir>   Directory to scan for PNGs (non-recursive).
                      Default: ${relative(process.cwd(), DEFAULT_INPUT)}
  -o, --output <dir>  Directory to write one JSON per flame plus
                      manifest.json. Created if missing.
                      Default: ${relative(process.cwd(), DEFAULT_OUTPUT)}
      --minify        Write compact JSON instead of 2-space indented.
      --dry-run       Parse and report, but write nothing.
  -h, --help          Show this message.

Output:
  <output>/<slug>.json   { slug, source, flame, animation, customVariations }
  <output>/manifest.json Per-flame summary: slug, transform count, animation,
                         dimensions, duplicate hash and validation warnings.

Exit code is 1 if any PNG carried a flame that failed validation.`)
}

function parseCliArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      input: { type: 'string', short: 'i' },
      output: { type: 'string', short: 'o' },
      minify: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  return {
    help: values.help,
    minify: values.minify,
    dryRun: values['dry-run'],
    inputDir: resolve(values.input ?? positionals[0] ?? DEFAULT_INPUT),
    outputDir: resolve(values.output ?? positionals[1] ?? DEFAULT_OUTPUT),
  }
}

// ── PNG chunk reader ─────────────────────────────────────────────────

let crcTable

function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      }
      crcTable[n] = c
    }
  }
  let crc = -1
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ -1) >>> 0
}

function hasPngSignature(bytes) {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
}

/**
 * Walk the PNG chunk list and return the inflated `FlameJson` text, or null
 * when the file simply has no flame embedded (a hand-made image, a crop that
 * lost its ancillary chunks). Malformed structure throws.
 */
function readFlameChunk(bytes, warnings) {
  if (!hasPngSignature(bytes)) {
    throw new Error('not a PNG (bad signature)')
  }
  let pos = PNG_HEADER_BYTES
  while (pos + CHUNK_LENGTH_BYTES + CHUNK_TYPE_BYTES <= bytes.length) {
    const length = bytes.readUInt32BE(pos)
    const typeStart = pos + CHUNK_LENGTH_BYTES
    const dataStart = typeStart + CHUNK_TYPE_BYTES
    const type = bytes.toString('latin1', typeStart, dataStart)
    const crcStart = dataStart + length
    if (crcStart + CHUNK_CRC_BYTES > bytes.length) {
      throw new Error(`truncated ${type} chunk at byte ${pos}`)
    }
    if (type === 'zTXt') {
      const data = bytes.subarray(dataStart, crcStart)
      // Keyword is NUL-terminated; the byte after it is the compression method.
      const separator = data.indexOf(0)
      const keyword = data.toString('latin1', 0, Math.max(separator, 0))
      if (keyword === CHUNK_KEYWORD) {
        if (data[separator + 1] !== COMPRESSION_DEFLATE) {
          throw new Error(
            `unsupported zTXt compression method ${String(data[separator + 1])}`,
          )
        }
        const storedCrc = bytes.readUInt32BE(crcStart)
        const actualCrc = crc32(bytes.subarray(typeStart, crcStart))
        if (storedCrc !== actualCrc) {
          warnings.push('zTXt CRC mismatch (chunk may be corrupt)')
        }
        return inflateSync(data.subarray(separator + 2)).toString('utf8')
      }
    }
    if (type === 'IEND') break
    pos = crcStart + CHUNK_CRC_BYTES
  }
  return null
}

// ── Normalization ────────────────────────────────────────────────────

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Collapse both export envelopes onto `{ flame, animation, customVariations }`. */
function normalizeEnvelope(raw) {
  if (!isPlainObject(raw)) {
    throw new Error('payload is not a JSON object')
  }
  if ('transforms' in raw) {
    return {
      flame: raw,
      animation: null,
      customVariations: raw.customVariations ?? null,
    }
  }
  if ('flame' in raw) {
    return {
      flame: raw.flame,
      animation: raw.animation ?? null,
      customVariations: raw.customVariations ?? null,
    }
  }
  throw new Error(
    'unrecognized envelope: expected a flame descriptor or { flame, animation }',
  )
}

// ── Structural validation ────────────────────────────────────────────

const AFFINE_2D_KEYS = ['a', 'b', 'c', 'd', 'e', 'f']
const AFFINE_3D_KEYS = [...AFFINE_2D_KEYS, 'g', 'h', 'i', 'j', 'k', 'l']

function checkAffine(affine, keys, label, errors) {
  if (!isPlainObject(affine)) {
    errors.push(`${label} is missing or not an object`)
    return
  }
  const missing = keys.filter((key) => typeof affine[key] !== 'number')
  if (missing.length > 0) {
    errors.push(`${label} is missing numeric ${missing.join(', ')}`)
  }
}

/**
 * Mirror the shape the valibot schema enforces, without importing it: the
 * required keys, non-empty transforms, numeric affines and a variation record
 * per transform. Returns hard `errors` (drop the flame) and soft `warnings`
 * (still usable, but the seeder should know).
 */
function inspectFlame(flame) {
  const errors = []
  const warnings = []
  if (!isPlainObject(flame)) {
    return { errors: ['flame is not an object'], warnings }
  }

  const renderSettings = flame.renderSettings
  if (!isPlainObject(renderSettings)) {
    errors.push('renderSettings is missing')
  }
  if (!isPlainObject(flame.metadata)) {
    warnings.push('metadata is missing')
  }

  const dimensions = isPlainObject(renderSettings)
    ? (renderSettings.dimensions ?? 2)
    : 2
  if (dimensions !== 2 && dimensions !== 3) {
    errors.push(
      `renderSettings.dimensions must be 2 or 3, got ${String(dimensions)}`,
    )
  }
  const affineKeys = dimensions === 3 ? AFFINE_3D_KEYS : AFFINE_2D_KEYS

  const transforms = flame.transforms
  if (!isPlainObject(transforms)) {
    errors.push('transforms is missing or not an object')
    return { errors, warnings, dimensions }
  }
  const transformIds = Object.keys(transforms)
  if (transformIds.length === 0) {
    errors.push('transforms is empty')
  }

  let variationCount = 0
  let probabilitySum = 0
  let visibleCount = 0
  const customTypes = new Set()
  for (const id of transformIds) {
    const transform = transforms[id]
    if (!isPlainObject(transform)) {
      errors.push(`transform ${id} is not an object`)
      continue
    }
    if (typeof transform.probability !== 'number') {
      errors.push(`transform ${id} has no numeric probability`)
    } else {
      probabilitySum += transform.probability
    }
    if (transform.visible !== false) visibleCount++
    checkAffine(
      transform.preAffine,
      affineKeys,
      `transform ${id} preAffine`,
      errors,
    )
    checkAffine(
      transform.postAffine,
      affineKeys,
      `transform ${id} postAffine`,
      errors,
    )
    const color = transform.color
    if (
      !isPlainObject(color) ||
      typeof color.x !== 'number' ||
      typeof color.y !== 'number'
    ) {
      errors.push(`transform ${id} has no numeric color {x, y}`)
    }
    const variations = transform.variations
    if (!isPlainObject(variations)) {
      errors.push(`transform ${id} has no variations record`)
      continue
    }
    const variationIds = Object.keys(variations)
    if (variationIds.length === 0) {
      warnings.push(`transform ${id} has no variations`)
    }
    variationCount += variationIds.length
    for (const variationId of variationIds) {
      const variation = variations[variationId]
      if (!isPlainObject(variation) || typeof variation.type !== 'string') {
        errors.push(`variation ${id}/${variationId} has no type`)
        continue
      }
      // Required by every variation descriptor, including the custom fallback.
      if (typeof variation.weight !== 'number') {
        errors.push(`variation ${id}/${variationId} has no numeric weight`)
      }
      if (variation.type.startsWith('custom')) {
        customTypes.add(variation.type)
      }
    }
  }

  if (transformIds.length > 0 && probabilitySum <= 0) {
    warnings.push('transform probabilities sum to 0 (nothing would render)')
  }
  if (transformIds.length > 0 && visibleCount === 0) {
    warnings.push('every transform is hidden')
  }

  return {
    errors,
    warnings,
    dimensions,
    transformCount: transformIds.length,
    variationCount,
    customTypes: [...customTypes],
  }
}

// ── Naming ───────────────────────────────────────────────────────────

function toSlug(fileName) {
  const stem = basename(fileName, extname(fileName))
  return (
    stem
      // Split camelCase words, but leave digit-to-letter runs alone so
      // `Exp_at_17B` stays `exp-at-17b` rather than `exp-at-17-b`.
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'flame'
  )
}

function uniqueSlug(slug, taken) {
  if (!taken.has(slug)) {
    taken.add(slug)
    return slug
  }
  let suffix = 2
  while (taken.has(`${slug}-${suffix}`)) suffix++
  const unique = `${slug}-${suffix}`
  taken.add(unique)
  return unique
}

/** Short digest of the transform set — identical exports share one hash. */
function transformsHash(transforms) {
  return createHash('sha1')
    .update(JSON.stringify(transforms))
    .digest('hex')
    .slice(0, 10)
}

// ── Reporting ────────────────────────────────────────────────────────

function printTable(headers, rows) {
  if (rows.length === 0) return
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => String(row[column]).length)),
  )
  const line = (cells) =>
    cells
      .map((cell, column) => String(cell).padEnd(widths[column]))
      .join('  ')
      .trimEnd()
  console.log(line(headers))
  console.log(line(widths.map((width) => '-'.repeat(width))))
  for (const row of rows) console.log(line(row))
}

// ── Main ─────────────────────────────────────────────────────────────

const options = parseCliArgs(process.argv.slice(2))
if (options.help) {
  printHelp()
  process.exit(0)
}

let entries
try {
  entries = readdirSync(options.inputDir, { withFileTypes: true })
} catch (error) {
  console.error(`Cannot read input directory ${options.inputDir}`)
  console.error(`  ${error.message}`)
  process.exit(1)
}

const pngFiles = entries
  .filter(
    (entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.png',
  )
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b))

const extracted = []
const skipped = []
const failed = []
const takenSlugs = new Set()

for (const fileName of pngFiles) {
  const warnings = []
  let json
  try {
    json = readFlameChunk(
      readFileSync(join(options.inputDir, fileName)),
      warnings,
    )
  } catch (error) {
    failed.push({ file: fileName, errors: [`read failed: ${error.message}`] })
    continue
  }
  if (json === null) {
    skipped.push({ file: fileName, reason: 'no FlameJson chunk' })
    continue
  }

  let normalized
  try {
    normalized = normalizeEnvelope(JSON.parse(json))
  } catch (error) {
    failed.push({ file: fileName, errors: [`bad payload: ${error.message}`] })
    continue
  }

  const report = inspectFlame(normalized.flame)
  if (report.errors.length > 0) {
    failed.push({ file: fileName, errors: report.errors })
    continue
  }
  warnings.push(...report.warnings)

  // The app only ships custom variation source alongside the flame in a share
  // payload; a PNG that references one without carrying its definition cannot
  // be rendered by a fresh client.
  if (report.customTypes.length > 0 && normalized.customVariations === null) {
    warnings.push(
      `references custom variations with no definitions: ${report.customTypes.join(', ')}`,
    )
  }

  const flame = normalized.flame
  const animation = normalized.animation
  const metadata = isPlainObject(flame.metadata) ? flame.metadata : {}
  const slug = uniqueSlug(toSlug(fileName), takenSlugs)
  extracted.push({
    source: fileName,
    slug,
    output: `${slug}.json`,
    name: typeof metadata.name === 'string' ? metadata.name : '',
    author: typeof metadata.author === 'string' ? metadata.author : '',
    schemaVersion: typeof flame.version === 'string' ? flame.version : null,
    transformCount: report.transformCount,
    variationCount: report.variationCount,
    dimensions: report.dimensions,
    hasAnimation: animation !== null,
    animationTrackCount: Array.isArray(animation?.tracks)
      ? animation.tracks.length
      : 0,
    transformsHash: transformsHash(flame.transforms),
    warnings,
    payload: {
      slug,
      source: fileName,
      flame,
      animation,
      customVariations: normalized.customVariations,
    },
  })
}

// Identical transform sets exported more than once — the seeder should pick
// one representative per group rather than shipping near-duplicate gallery
// entries.
const byHash = new Map()
for (const entry of extracted) {
  const group = byHash.get(entry.transformsHash) ?? []
  group.push(entry.slug)
  byHash.set(entry.transformsHash, group)
}
const duplicateGroups = [...byHash.entries()]
  .filter(([, slugs]) => slugs.length > 1)
  .map(([hash, slugs]) => ({ hash, slugs }))

const manifest = {
  generatedAt: new Date().toISOString(),
  sourceDir: options.inputDir,
  counts: {
    found: pngFiles.length,
    extracted: extracted.length,
    skipped: skipped.length,
    failed: failed.length,
    uniqueTransformSets: byHash.size,
  },
  duplicateGroups,
  flames: extracted.map(({ payload: _payload, ...summary }) => summary),
  skipped,
  failed,
}

if (!options.dryRun) {
  mkdirSync(options.outputDir, { recursive: true })
  const indent = options.minify ? undefined : 2
  for (const entry of extracted) {
    writeFileSync(
      join(options.outputDir, entry.output),
      `${JSON.stringify(entry.payload, null, indent)}\n`,
    )
  }
  writeFileSync(
    join(options.outputDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
}

console.log(`Input:  ${options.inputDir}`)
console.log(
  `Output: ${options.dryRun ? '(dry run, nothing written)' : options.outputDir}`,
)
console.log('')
printTable(
  ['slug', 'tf', 'var', 'dim', 'anim', 'warn', 'source'],
  extracted.map((entry) => [
    entry.slug,
    entry.transformCount,
    entry.variationCount,
    `${entry.dimensions}D`,
    entry.hasAnimation ? `${entry.animationTrackCount} tracks` : '-',
    entry.warnings.length > 0 ? entry.warnings.length : '-',
    entry.source,
  ]),
)

if (skipped.length > 0) {
  console.log('')
  console.log('Skipped (no embedded flame):')
  for (const entry of skipped) {
    console.log(`  ${entry.file} - ${entry.reason}`)
  }
}

if (failed.length > 0) {
  console.log('')
  console.log('Failed validation (not written):')
  for (const entry of failed) {
    console.log(`  ${entry.file}`)
    for (const message of entry.errors) console.log(`    ${message}`)
  }
}

const warned = extracted.filter((entry) => entry.warnings.length > 0)
if (warned.length > 0) {
  console.log('')
  console.log('Warnings:')
  for (const entry of warned) {
    for (const message of entry.warnings) {
      console.log(`  ${entry.source}: ${message}`)
    }
  }
}

console.log('')
printTable(
  ['metric', 'count'],
  [
    ['PNGs found', pngFiles.length],
    ['Extracted', extracted.length],
    ['Skipped (no flame)', skipped.length],
    ['Failed', failed.length],
    ['Unique transform sets', byHash.size],
    ['Animated', extracted.filter((entry) => entry.hasAnimation).length],
    ['3D', extracted.filter((entry) => entry.dimensions === 3).length],
    ['With warnings', warned.length],
  ],
)

if (failed.length > 0) process.exitCode = 1
