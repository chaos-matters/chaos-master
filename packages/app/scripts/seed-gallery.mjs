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
//   node scripts/seed-gallery.mjs --apply local   # execute against D1
//                                                 # (local|dev|prod)
//
// `local` is the dev database in wrangler's own local storage, and is the one
// target this script will create the schema for first — see below.
//
// Curation lives in CURATION below. Re-running is safe: every row is an
// upsert keyed on slug, so editing an entry here and re-applying updates the
// live gallery without a deploy.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { couldNotRun, couldNotRunLines, migrationsArgs, storageFlags, TARGET_LIST, targetLabel, TARGETS, } from './gallery-targets.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')

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
    { slug: 'aurora-drift', title: 'Aurora Drift', example: 'example29' },
    { slug: 'ember-lattice', title: 'Ember Lattice', example: 'example33' },
    { slug: 'tidal-bloom', title: 'Tidal Bloom', example: 'example40' },
    { slug: 'spectrum-swirl', title: 'Spectrum Swirl', example: 'example45' },
    { slug: 'enchanted-rose', title: 'Enchanted Rose', example: 'example34' },
    { slug: 'deep-current', title: 'Deep Current', example: 'example46' },
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
      // Enchanted Rose v2 is literally a descendant of `enchanted-rose` in the
      // gallery, so the card shows what breeding produces rather than just
      // asserting it. (Was example33, which is `ember-lattice` on the wall.)
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
  const args = { out: null, apply: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i]
    else if (argv[i] === '--apply') args.apply = argv[++i]
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
  }
  return args
}

/** Bundle + run the TS entry point, returning the parsed flames/animations. */
function loadContent() {
  const dir = mkdtempSync(join(tmpdir(), 'gallery-seed-'))
  const bundle = join(dir, 'dump.mjs')
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
    { captured: false, consequence: 'the example flames were never bundled' },
  )
  const out = run(
    'node',
    [bundle],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    { captured: true, consequence: 'the bundled examples were never read' },
  )
  return JSON.parse(out)
}

const sqlStr = (v) =>
  v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`

function rowFor(entry, section, order, content) {
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

  const dimensions = flame.renderSettings?.dimensions === 3 ? 3 : 2
  const transformCount = Object.keys(flame.transforms ?? {}).length
  if (transformCount === 0) {
    throw new Error(`${entry.slug} resolved to a flame with no transforms`)
  }

  return [
    sqlStr(entry.slug),
    sqlStr(entry.title),
    sqlStr(entry.caption ?? null),
    sqlStr(flame.metadata?.author ?? null),
    sqlStr(section),
    sqlStr(entry.capability ?? null),
    sqlStr(JSON.stringify(flame)),
    animation === null ? 'NULL' : sqlStr(JSON.stringify(animation)),
    String(dimensions),
    String(transformCount),
    // poster_key, poster_width, poster_height, poster_frame — the poster
    // pipeline owns all four (capture + upload-gallery-posters.mjs).
    'NULL, NULL, NULL, NULL',
    String(order),
    '1',
  ].join(', ')
}

function buildSql(content) {
  const lines = [
    '-- Generated by scripts/seed-gallery.mjs — do not edit by hand.',
    '-- Re-running replaces every row: curation lives in the script.',
    '',
  ]
  const values = []
  for (const [section, entries] of Object.entries(CURATION)) {
    entries.forEach((entry, i) => {
      values.push(`  (${rowFor(entry, section, i, content)})`)
    })
  }
  lines.push(
    'INSERT INTO gallery_items (',
    '  slug, title, caption, author, section, capability, flame, animation,',
    '  dimensions, transform_count, poster_key, poster_width, poster_height,',
    '  poster_frame, sort_order, published',
    ') VALUES',
    values.join(',\n'),
    'ON CONFLICT(slug) DO UPDATE SET',
    '  title = excluded.title,',
    '  caption = excluded.caption,',
    '  author = excluded.author,',
    '  section = excluded.section,',
    '  capability = excluded.capability,',
    '  flame = excluded.flame,',
    '  animation = excluded.animation,',
    '  dimensions = excluded.dimensions,',
    '  transform_count = excluded.transform_count,',
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

  const content = loadContent()
  const sql = buildSql(content)
  const total = Object.values(CURATION).reduce((n, e) => n + e.length, 0)

  if (args.apply) {
    const target = TARGETS[args.apply]
    if (!target) {
      console.error(`Unknown target "${args.apply}" — expected ${TARGET_LIST}.`)
      process.exit(1)
    }
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
