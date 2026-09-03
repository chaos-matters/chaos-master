#!/usr/bin/env node
// Seed the Home tab's gallery content into D1.
//
// The flames live in TypeScript modules under src/flame/examples, so this
// bundles a tiny entry point with esbuild and runs it in plain node — no
// browser, no GPU, no test runner. Output is SQL, which is deliberately
// boring: it can be reviewed, checked in, and replayed against any
// environment.
//
//   node scripts/seed-gallery.mjs                 # print SQL to stdout
//   node scripts/seed-gallery.mjs --out seed.sql  # write to a file
//   node scripts/seed-gallery.mjs --apply local   # stage in local D1
//   node scripts/seed-gallery.mjs --apply local --publish  # local preview
//
// `local` is the dev database in wrangler's own local storage, and is the one
// target this script will create the schema for first — see below.
//
// Curation lives in CURATION below. This seed path is local-only and staged by
// default; shared dev/prod curation goes through gallery-admin's poster and
// provenance publication gate.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { couldNotRun, couldNotRunLines, migrationsArgs, storageFlags, targetLabel, TARGETS, } from './gallery-targets.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')
const PROJECT_LICENSE_URL =
  'https://github.com/chaos-matters/chaos-master/blob/main/LICENSE'
const PROJECT_AUTHOR = 'Lumen Apeiron'

/**
 * Run a child, and say so plainly when it never started.
 *
 * `captured` says whether THIS call piped the child's streams. Where stderr is
 * inherited node captures nothing, so empty streams are the default rather
 * than a signal, and only a spawn error proves nothing ran — testing emptiness
 * there would report a wrangler that failed loudly on the terminal as a
 * command that could not be found.
 *
 * Worth catching at all because the alternative is an ENOENT stack trace
 * naming node's internals instead of PATH, which is what a run from a desktop
 * launcher or a systemd unit gets: both inherit a PATH without the nvm bin
 * dir, and that one directory holds node, pnpm and esbuild alike.
 */
function run(command, args, options, { captured, consequence }) {
  try {
    return execFileSync(command, args, { cwd: appDir, ...options })
  } catch (error) {
    if (!couldNotRun(error, { captured })) throw error
    console.error(`Could not run \`${command}\` — ${consequence}.`)
    for (const line of couldNotRunLines(command, error)) {
      console.error(`  ${line}`)
    }
    process.exit(1)
  }
}

/**
 * What Home shows, in the order it shows it.
 *
 * `hero` takes exactly one entry; `gallery` is the editorial-span wall;
 * `motion` are animated pieces; `capability` entries each open a flame chosen
 * to demonstrate one feature.
 */
const CURATION = {
  hero: [
    {
      slug: 'first-light',
      title: 'First Light',
      caption: 'The default flame, and the one everything else grew out of.',
      example: 'example1',
    },
  ],
  gallery: [
    // Rights-safe launch collection: canonical public mathematical
    // constructions, implemented here as original flame descriptors. These
    // remain structurally exact; only color and camera are presentation.
    {
      slug: 'classic-sierpinski-triangle',
      title: 'Sierpiński Triangle',
      caption: 'Classic IFS · Three exact maps, one infinite gasket.',
      example: 'sierpinskiTriangle',
    },
    {
      slug: 'classic-sierpinski-carpet',
      title: 'Sierpiński Carpet',
      caption: 'Classic IFS · Eight maps remove the center at every scale.',
      example: 'sierpinskiCarpet',
    },
    {
      slug: 'classic-barnsley-fern',
      title: 'Barnsley Fern',
      caption: 'Classic IFS · Four probabilities grow a botanical silhouette.',
      example: 'barnsleyFern',
    },
    {
      slug: 'classic-koch-curve',
      title: 'Koch Curve',
      caption: 'Classic IFS · Four joined thirds make an edge without end.',
      example: 'kochCurve',
    },
    {
      slug: 'classic-heighway-dragon',
      title: 'Heighway Dragon',
      caption: 'Classic IFS · Two folded maps meet at the dragon’s hinge.',
      example: 'heighwayDragon',
    },
    {
      slug: 'classic-menger-sponge',
      title: 'Menger Sponge',
      caption: 'Classic IFS · Twenty affine branches carve an endless void.',
      example: 'mengerSponge',
    },
    {
      slug: 'neon-julian-cosmos',
      title: 'Neon Julian Cosmos',
      caption: 'A fivefold Julia bloom orbiting a layered spherical core.',
      example: 'neonJulianCosmos',
    },
    {
      slug: 'golden-apollonian-gasket',
      title: 'Golden Apollonian Gasket',
      caption: 'Three spherical inversions become a luminous infinite study.',
      example: 'goldenApollonianGasket',
    },
    {
      slug: 'cybernetic-swirl',
      title: 'Cybernetic Swirl',
      caption: 'Interlocking fields turn a neon vortex into a machine.',
      example: 'cyberneticSwirl',
    },
  ],
  // Animations are referenced by their definition id from examples/animations.
  //
  // One flame per KIND of motion, and no flame twice: camera movement, a
  // parameter sweep, and a 3D orbit. `ex1-affine-morph` used to hold the third
  // slot, which made two of the three tiles — and the hero — the same flame.
  motion: [
    { slug: 'camera-pan', title: 'Camera Pan', animation: 'ex1-camera-pan' },
    {
      slug: 'julia-power-wave',
      title: 'Julia Power Wave',
      animation: 'ex2-julia-power-wave',
    },
    {
      slug: 'geode-orbit',
      title: 'Geode Orbit',
      animation: 'ex36-geode-orbit',
    },
  ],
  // Each card's flame is chosen to make its feature legible AND is used nowhere
  // else on the page: four of these used to be the exact flames hanging in the
  // gallery above, so Explore read as a second, smaller copy of the wall.
  capability: [
    {
      // Stays a morph of the hero flame on purpose: "the flame you met at the
      // top of the page, animated" is the clearest possible before/after.
      slug: 'cap-animation',
      title: 'Animation',
      caption: 'Keyframe any parameter and play it back on a timeline.',
      capability: 'animation',
      animation: 'ex1-pie-full-morph',
    },
    {
      // Cyber Mandala: 10 distinct variation types across 4 transforms, the
      // widest spread in the set — which is exactly what a roll of the dice
      // produces. (Was example45, which is `spectrum-swirl` on the wall.)
      slug: 'cap-randomizer',
      title: 'Randomizer',
      caption: 'Roll a whole flame, then steer it.',
      capability: 'randomizer',
      example: 'example21',
    },
    {
      // Enchanted Rose v2 shows what breeding produces rather than merely
      // asserting it, without repeating one of the editorial wall flames.
      slug: 'cap-genetics',
      title: 'Flame genetics',
      caption: 'Breed two flames and evolve the result.',
      capability: 'genetics',
      example: 'example44',
    },
    {
      // Phoenix Ascension: 10 variation types with independent weights, so
      // there is plenty for a frequency band to visibly drive. (Was example29,
      // which is `aurora-drift` on the wall.)
      slug: 'cap-audio',
      title: 'Audio flames',
      caption: 'Wire frequency bands and beats to any parameter.',
      capability: 'audio',
      example: 'example22',
    },
    {
      // Ripple Veil: standing waves made visible (ripple/sinusGrid/hexes),
      // which is the closest the set gets to drawing what sonification hears.
      // (Was example40, which is `tidal-bloom` on the wall.)
      slug: 'cap-sonification',
      title: 'Sonification',
      caption: 'Turn the structure of a flame into sound.',
      capability: 'sonification',
      example: 'example14',
    },
  ],
}

function parseArgs(argv) {
  const args = { out: null, apply: null, publish: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' || argv[i] === '--apply') {
      const option = argv[i]
      const value = argv[++i]
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${option} requires a value`)
      }
      if (option === '--out') args.out = value
      else args.apply = value
    } else if (argv[i] === '--publish') args.publish = true
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
    else throw new Error(`Unknown option: ${argv[i]}`)
  }
  return args
}

/** Bundle + run the TS entry point, returning the parsed flames/animations. */
function loadContent() {
  const dir = mkdtempSync(join(tmpdir(), 'gallery-seed-'))
  const bundle = join(dir, 'dump.mjs')
  try {
    run(
      'pnpm',
      [
        'exec',
        'esbuild',
        join(scriptDir, 'dump-examples.entry.ts'),
        '--bundle',
        '--platform=node',
        '--format=esm',
        '--log-level=error',
        `--alias:@=${join(appDir, 'src')}`,
        `--outfile=${bundle}`,
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] },
      {
        captured: false,
        consequence: 'the example flames were never bundled',
      },
    )
    const out = run(
      'node',
      [bundle],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
      { captured: true, consequence: 'the bundled examples were never read' },
    )
    return JSON.parse(out)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const sqlStr = (v) =>
  v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`

function rowFor(entry, section, order, content, published) {
  let flame
  let animation = null

  if (entry.animation) {
    const anim = content.animations.find((a) => a.id === entry.animation)
    if (!anim) throw new Error(`Unknown animation id: ${entry.animation}`)
    flame = anim.flame
    // Same envelope the app's own animated PNG export writes.
    animation = { tracks: anim.tracks }
  } else {
    flame = content.flames[entry.example]
    if (!flame) throw new Error(`Unknown example: ${entry.example}`)
  }

  const author = entry.author?.trim() || PROJECT_AUTHOR
  flame = {
    ...flame,
    metadata: {
      ...flame.metadata,
      author,
    },
  }

  const dimensions = flame.renderSettings?.dimensions === 3 ? 3 : 2
  const transformCount = Object.keys(flame.transforms ?? {}).length
  if (transformCount === 0) {
    throw new Error(`${entry.slug} resolved to a flame with no transforms`)
  }

  const collection = entry.slug.startsWith('classic-')
    ? 'foundation'
    : 'original'
  const provenance = 'project-original'
  const attribution =
    collection === 'foundation'
      ? `Canonical construction · encoded by ${author}`
      : `Created by ${author}`

  return [
    sqlStr(entry.slug),
    sqlStr(entry.title),
    sqlStr(entry.caption ?? null),
    sqlStr(author),
    sqlStr(section),
    sqlStr(entry.capability ?? null),
    sqlStr(JSON.stringify(flame)),
    animation === null ? 'NULL' : sqlStr(JSON.stringify(animation)),
    sqlStr(collection),
    sqlStr(provenance),
    'NULL',
    sqlStr('AGPL-3.0-only'),
    sqlStr(PROJECT_LICENSE_URL),
    sqlStr(attribution),
    'NULL',
    'NULL',
    String(dimensions),
    String(transformCount),
    // poster_key, poster_width, poster_height, poster_frame — the poster
    // pipeline owns all four (capture + upload-gallery-posters.mjs).
    'NULL, NULL, NULL, NULL',
    String(order),
    published ? '1' : '0',
    "'curated'",
    "'curated'",
    'NULL',
    'NULL',
  ].join(', ')
}

function buildSql(content, { published = false } = {}) {
  const lines = [
    '-- Generated by scripts/seed-gallery.mjs — do not edit by hand.',
    '-- Re-running upserts this curated set; it never deletes unrelated rows.',
    '',
  ]
  const values = []
  for (const [section, entries] of Object.entries(CURATION)) {
    entries.forEach((entry, i) => {
      values.push(`  (${rowFor(entry, section, i, content, published)})`)
    })
  }
  lines.push(
    'INSERT INTO gallery_items (',
    '  slug, title, caption, author, section, capability, flame, animation,',
    '  collection, provenance_kind, source_url, license, license_url,',
    '  attribution, changes, original_id,',
    '  dimensions, transform_count, poster_key, poster_width, poster_height,',
    '  poster_frame, sort_order, published, submission_source,',
    '  moderation_status, consent_version, reviewed_at',
    ') VALUES',
    values.join(',\n'),
    'ON CONFLICT(slug) DO UPDATE SET',
    '  title = excluded.title,',
    '  caption = excluded.caption,',
    '  author = excluded.author,',
    '  section = excluded.section,',
    '  capability = excluded.capability,',
    '  collection = excluded.collection,',
    '  provenance_kind = excluded.provenance_kind,',
    '  source_url = excluded.source_url,',
    '  license = excluded.license,',
    '  license_url = excluded.license_url,',
    '  attribution = excluded.attribution,',
    '  changes = excluded.changes,',
    '  original_id = excluded.original_id,',
    '  flame = excluded.flame,',
    '  animation = excluded.animation,',
    '  dimensions = excluded.dimensions,',
    '  transform_count = excluded.transform_count,',
    '  poster_key = NULL,',
    '  poster_width = NULL,',
    '  poster_height = NULL,',
    '  poster_frame = NULL,',
    '  sequence = NULL,',
    "  submission_source = 'curated',",
    "  moderation_status = 'curated',",
    '  consent_version = NULL,',
    '  reviewed_at = NULL,',
    '  sort_order = excluded.sort_order,',
    '  published = excluded.published;',
    '',
  )
  return lines.join('\n')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(
      readFileSync(fileURLToPath(import.meta.url), 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('//'))
        .map((l) => l.replace(/^\/\/ ?/, ''))
        .join('\n'),
    )
    return
  }

  if (args.apply !== null && args.apply !== 'local') {
    throw new Error(
      'seed-gallery only applies to local D1; use gallery-admin to stage shared dev/prod rows',
    )
  }
  if (args.publish && args.apply !== 'local') {
    throw new Error('--publish is only valid with --apply local')
  }

  // Refuse unsafe targets before bundling the examples. Besides being faster,
  // this guarantees a rejected command cannot reach Wrangler or any database.
  const content = loadContent()
  const sql = buildSql(content, { published: args.publish })
  const total = Object.values(CURATION).reduce((n, e) => n + e.length, 0)

  if (args.apply) {
    const target = TARGETS[args.apply]
    const where = storageFlags(args.apply)
    // A local store starts with no tables at all, and it is a sqlite file under
    // packages/app/.wrangler that nobody else can see — so seeding from zero is
    // one command there. Wrangler skips the migrations it has already applied,
    // which is what makes running this before every local seed a no-op after
    // the first. Remote targets are left alone: a missing table on a shared
    // database is a problem to look at, not something a seed script should
    // quietly fix.
    if (target.storage === 'local') {
      run(
        'pnpm',
        migrationsArgs(args.apply),
        { stdio: ['ignore', 'ignore', 'inherit'] },
        {
          captured: false,
          consequence: `no migrations were applied to ${targetLabel(args.apply)}`,
        },
      )
    }
    const dir = mkdtempSync(join(tmpdir(), 'gallery-sql-'))
    try {
      const file = join(dir, 'seed.sql')
      writeFileSync(file, sql)
      run(
        'pnpm',
        [
          'exec',
          'wrangler',
          'd1',
          'execute',
          target.database,
          ...where,
          `--file=${file}`,
        ],
        { stdio: 'inherit' },
        {
          captured: false,
          consequence: `no rows reached ${targetLabel(args.apply)}`,
        },
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    console.error(`Applied ${total} rows to ${targetLabel(args.apply)}.`)
    return
  }

  if (args.out) {
    writeFileSync(resolve(process.cwd(), args.out), sql)
    console.error(`Wrote ${total} rows to ${args.out}.`)
    return
  }

  process.stdout.write(sql)
}

main()
