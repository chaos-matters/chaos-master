#!/usr/bin/env node
// gallery-admin — the one entry point for Home tab gallery content.
//
// A gallery item is three things: a row in D1 (the FlameDescriptor plus its
// title, section and ordering), a poster in R2 (the still shown to visitors
// without WebGPU), and a live GPU render. This script owns the row, drives the
// existing pipeline for the poster, and never pretends to do the third.
//
// Every subcommand writes ONE JSON object to stdout and human progress to
// stderr, so a console can shell out to it and a person can still read it:
//
//   node scripts/gallery-admin.mjs list | jq '.items[].slug'
//
// Exit code is 0 when the command did what was asked and 1 otherwise. A
// failure still prints JSON: { ok: false, command, error: { code, message } }.
//
// Subcommands (each takes --help):
//   list     what is in the gallery
//   audit    read-only publication-readiness check for every published row
//   inspect  what is inside dropped PNG/JSON files — writes nothing
//   put      stage a flame as a gallery row (published = 0, no poster)
//   capture  render + upload posters for rows that need one
//   publish  take a staged row live, or pull a live one back
//   reorder  set a row's position within its section
//   sequence give a row a curated flame walk (or clear it back to one still)
//   delete   remove an unpublished row and its poster — the only destructive one
//   config   read or write Home's settings (home_config), allowlisted keys
//
// Three deliberate constraints:
//
//   --env defaults to local: the dev database and bucket, addressed through
//   wrangler's local (miniflare) storage instead of the network. Curating a
//   gallery and looking at it should cost nothing and reach nobody, so both
//   deployed targets are a deliberate choice — and prod additionally requires
//   --confirm prod. The console this serves defaults to prod elsewhere; a
//   content tool inheriting that default publishes to production by accident
//   eventually.
//
//   put NEVER publishes. It writes published = 0 and poster_key = NULL, so
//   going live is always the separate, deliberate `publish` call.
//
//   delete is intentionally awkward: only an unpublished row, with its slug
//   repeated in --yes. Unpublish is the reversible default.
//
// Extraction and validation are NOT reimplemented here: scripts/extract-flames.mjs
// owns "what is inside this PNG", and capture/upload-gallery-posters.mjs own the
// poster pipeline. This script composes them.

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { CAPTURE_PAGE, checkoutFailure, probeCapturePage, verifyServedCheckout, } from './dev-server-checkout.mjs'
import { inspectFlame, isPlainObject, normalizeEnvelope, readFlameChunk, toSlug, transformsHash, } from './extract-flames.mjs'
import { GALLERY_COLLECTIONS, PROVENANCE_KINDS, publicationReadiness, } from './gallery-publication-policy.mjs'
import { couldNotRun, couldNotRunDetail, initCommand, isMissingTable, MIGRATIONS_DIR, migrationsArgs, storageFlags, tail, TARGET_LIST, targetLabel, TARGETS, } from './gallery-targets.mjs'
import { checkConfigEntry, CONFIG_KEY_LIST, CONFIG_KEYS, } from './home-config.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')
const repoRoot = resolve(appDir, '../..')

// Fixed by the page design and by the CHECK constraint in
// migrations/0001_gallery_content.sql — a typo must fail here, not in D1.
const SECTIONS = ['hero', 'gallery', 'motion', 'capability']

// Not constrained by the schema, but these are the five Home knows how to
// label. Anything else is accepted with a warning rather than refused.
const CAPABILITIES = [
  'animation',
  'randomizer',
  'genetics',
  'audio',
  'sonification',
]

// The exact guard the Worker applies to /api/gallery/<slug>. A slug it would
// reject can never be fetched, so refuse to write one.
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

// Everything except the descriptors themselves: a list of 60 flames would be
// megabytes of JSON, and nothing reading a list needs them.
const ROW_COLUMNS =
  'slug, title, caption, author, section, capability, dimensions, ' +
  'collection, provenance_kind, source_url, license, license_url, ' +
  'attribution, changes, original_id, ' +
  'transform_count, poster_key, poster_width, poster_height, poster_frame, ' +
  'sort_order, published, (animation IS NOT NULL) AS has_animation, ' +
  // Presence, not the value: a curated sequence is the largest thing in the
  // table and no console view needs the flames themselves — but an operator
  // does need to see that this row plays a walk rather than resting on one
  // still, because re-staging clears it (see the upsert in commandPut).
  '(sequence IS NOT NULL) AS has_sequence, ' +
  'created_at, updated_at'

const DEFAULT_POSTER_DIR = join(repoRoot, 'assets/local/gallery-posters')
const DEFAULT_DEV_BASE = 'https://localhost:5173'
const DEV_SERVER_TIMEOUT_MS = 180_000
const DEV_SERVER_COMMAND = 'pnpm --filter chaos-master start'

// Vite colours its startup URLs. Dropping everything outside printable ASCII
// takes the escape bytes (and the QR code block characters) out of the way
// without putting a control character inside a regex.
const PRINTABLE_ONLY = /[^\x20-\x7E]+/g
const SERVER_URL = /https?:\/\/[^\s/]*:(\d+)/

// vite-plugin-qrcode prints a heading, a bare URL and a 15-line block-glyph QR
// code for EVERY LAN address the machine has — three of them here, ~45 lines of
// ASCII pixels forwarded into a capture log whose whole job is to be read and
// copied. Vite's own `Local:`/`Network:` lines are three lines above and say the
// same thing, so drop the QR banner and keep everything else.
//
// COLOR_RESIDUE is what PRINTABLE_ONLY leaves of a colour escape once its ESC
// byte is gone.
const COLOR_RESIDUE = /\[[0-9;]*m/g
const QR_HEADING = /^Visit page on\b/
// The QR code's own caption: a bare URL alone on its line. Vite's URLs carry a
// `Local:`/`Network:` prefix, so those still get through.
const BARE_URL = /^https?:\/\/\S+$/

/**
 * Is this dev-server line QR-code decoration rather than information?
 *
 * PRINTABLE_ONLY drops the escape bytes AND every block glyph, so a QR row
 * reduces to nothing but its own indentation — which beats enumerating the
 * glyphs, and keeps a control character out of a regex.
 */
function isQrBanner(line) {
  const text = line
    .replace(PRINTABLE_ONLY, '')
    .replace(COLOR_RESIDUE, '')
    .trim()
  return text.length === 0 || QR_HEADING.test(text) || BARE_URL.test(text)
}

// ── Output ───────────────────────────────────────────────────────────
// stdout is the result and nothing else; stderr is for humans.

class AdminError extends Error {
  constructor(code, message, detail = null) {
    super(message)
    this.name = 'AdminError'
    this.code = code
    this.detail = detail
  }
}

function note(message) {
  process.stderr.write(`${message}\n`)
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

// ── Help ─────────────────────────────────────────────────────────────

const COMMON_OPTIONS = `  --env local|dev|prod  where to read and write (default local)
                        local = the dev database and bucket in wrangler's own
                        local storage; nothing leaves this machine
  --confirm prod        required alongside --env prod, on every subcommand`

const HELP = {
  '': `gallery-admin — manage Home tab gallery content

Usage:
  node scripts/gallery-admin.mjs <command> [options]

Commands:
  list      list every gallery row with its section, order and poster
  audit     check every published row against the shared publication gate
  inspect   report what is inside PNG/JSON files, writing nothing
  put       stage a flame as a gallery row (published = 0, poster_key = NULL)
  capture   render and upload posters for rows that have none
  publish   set published to 0 or 1 for one row
  reorder   set sort_order for one row
  sequence  give a row a curated flame walk, or clear it back to one still
  delete    remove an unpublished row and its poster (not reversible)
  config    read or write Home's settings (allowlisted keys)

${COMMON_OPTIONS}
  -h, --help            this message, or a command's own with
                        \`<command> --help\`

Output:
  One JSON object on stdout per run; progress on stderr. Every result carries
  \`env\`, \`storage\` (local|remote) and \`database\`, because local and dev
  share a database name. Exit 0 on success, 1 on failure (the JSON then
  carries an \`error\` object).

Prefer the reversible \`publish --published 0\`. The delete command only accepts
an already-unpublished row and repeats its slug as confirmation.`,

  list: `gallery-admin list — every row in the gallery

Usage:
  node scripts/gallery-admin.mjs list [--env ${TARGET_LIST}] [--confirm prod]

${COMMON_OPTIONS}

Prints slug, title, section, capability, sort_order, published, poster_key,
dimensions, transform_count and has_animation for every row, plus per-section
totals. The flame descriptors themselves are deliberately omitted.

Against --env local this also creates the gallery schema if it is not there
yet, so a fresh checkout needs no setup step.`,

  audit: `gallery-admin audit — read-only publication readiness

Usage:
  node scripts/gallery-admin.mjs audit [--env ${TARGET_LIST}] [--confirm prod]

${COMMON_OPTIONS}

Checks every published row against the exact same strict gate used before a
shared dev/prod publication: poster, dimensions, creator credit, provenance,
rights and visible attribution. It never creates a schema or changes D1/R2.

Returns \`ok: false\` and exits 1 when any published row has unresolved blockers,
while still printing every affected slug and issue for automation and review.`,

  inspect: `gallery-admin inspect — what is inside a file, without writing anything

Usage:
  node scripts/gallery-admin.mjs inspect --file <png|json> [--file ...]

Options:
  --file <path>         a PNG exported by the app, or a flame JSON. Repeatable.

Reads the embedded FlameJson chunk (PNG) or the JSON envelope, validates it
structurally, and reports the derived slug, title, transform count, dimensions,
animation and every blocking issue or warning. No environment, no database, no
writes — this is what a console calls to preview a dropped file.

Exit code is 1 if any file would be rejected by \`put\`; the full report is
printed either way.`,

  put: `gallery-admin put — stage a flame as a gallery row

Usage:
  node scripts/gallery-admin.mjs put --file <png|json> --section <name> [options]

Options:
  --file <path>         a PNG exported by the app, or a flame JSON (exactly one)
  --section <name>      ${SECTIONS.join(' | ')}
  --slug <slug>         defaults to a kebab-case slug from the filename
  --title <text>        defaults to the flame's metadata.name, then the slug
  --caption <text>      optional one-line caption shown under the plate
  --author <text>       public creator credit (defaults to flame metadata)
  --collection <name>   ${GALLERY_COLLECTIONS.join(' | ')} (default original)
  --provenance <kind>   ${PROVENANCE_KINDS.join(' | ')} (default unknown)
  --source-url <url>    canonical page for the source work
  --license <text>      SPDX id or exact written-permission label
  --license-url <url>   public license or permission page, when available
  --attribution <text>  exact credit shown on Home
  --changes <text>      what this edition/remix changed
  --original-id <text>  source slug, genome id, or other stable identifier
  --capability <name>   required for --section capability; rejected otherwise
                        (${CAPABILITIES.join(', ')})
${COMMON_OPTIONS}

The row is written with published = 0 and poster_key = NULL: put STAGES, it
never publishes. Existing rows are upserted on slug, keeping their sort_order.
Third-party metadata may be staged incomplete, but shared dev/prod publication
is blocked until credit, rights and poster requirements are complete. A flame
referencing custom variations whose definitions are absent is refused — it
would render wrong on Home.`,

  capture: `gallery-admin capture — posters for rows that need one

Usage:
  node scripts/gallery-admin.mjs capture --all-missing [--env ${TARGET_LIST}]
  node scripts/gallery-admin.mjs capture --slug a,b [--env ${TARGET_LIST}]

Options:
  --slug a,b,c          capture exactly these slugs
  --all-missing         capture every row Home cannot render live from: no
                        poster at all, or an animated row whose poster has no
                        poster_frame recorded (captured before the column
                        existed, so its frame is unknown)
  --out <dir>           poster output directory
                        (default assets/local/gallery-posters)
  --base <url>          dev server origin (default ${DEFAULT_DEV_BASE})
  --timeout <ms>        how long to wait for the dev server
                        (default ${DEV_SERVER_TIMEOUT_MS})
  --no-serve            fail instead of starting a dev server
${COMMON_OPTIONS}

Runs capture-gallery-posters.mjs (headed Chromium, real GPU) and then
upload-gallery-posters.mjs, including unpublished rows so a staged flame can
get its poster before going live. Both inherit --env, so a local capture reads
local rows and uploads into the local bucket.

The capture page is served by the app dev server. If it is not reachable, this
starts it (\`${DEV_SERVER_COMMAND}\`), waits for the page to
answer, and shuts it down again afterwards. With --no-serve it exits at once
with the command to run instead.

A dev server that is already up is reused only if it is serving THIS checkout.
Every worktree answers the capture page on the same port, so reusing whichever
one owns it renders posters from that tree's code with nothing in the image to
show for it — so a foreign checkout is a hard failure, naming both paths.`,

  publish: `gallery-admin publish — take a row live, or pull it back

Usage:
  node scripts/gallery-admin.mjs publish --slug <slug> --published 0|1 [options]

Options:
  --slug <slug>         the row to change
  --published 0|1       1 shows it on Home, 0 hides it again
${COMMON_OPTIONS}

Unpublishing is the reversible alternative to deleting, which this tool does
not do. Local publication reports incomplete poster/provenance as warnings so
curation stays easy. Shared dev/prod publication blocks them, preventing an
uncredited work or empty no-WebGPU plate from going live.`,

  reorder: `gallery-admin reorder — position within a section

Usage:
  node scripts/gallery-admin.mjs reorder --slug <slug> --order <n> [options]

Options:
  --slug <slug>         the row to move
  --order <n>           sort_order, ascending; ties break on slug
${COMMON_OPTIONS}

Prints the section's resulting order so a duplicate position is obvious.`,

  sequence: `gallery-admin sequence — a curated flame walk for one row

Usage:
  node scripts/gallery-admin.mjs sequence --slug <slug> [options]

Options:
  --slug <slug>         the row to give a sequence
  --mode steer|breed    what the derived flames ARE (default steer):
                          steer — the row's flame pushed around by mutation,
                                  which is what cap-randomizer claims
                          breed — crossed with a freshly rolled mate, one child
                                  per crossover mode, which is cap-genetics'
  --derived <n>         how many derived flames (default 3)
  --seed <n>            PRNG seed; the same seed gives the same flames
  --paths <n>           concatenate N whole runs into the one column
  --clear               back to a single still
  --file <path>         append ONE hand-picked flame (PNG/JSON) to the end of
                        the row's existing walk instead of generating. Held to
                        the same validation the put command applies.
  --preview             render every candidate and print them as base64 images
                        WITHOUT writing anything. Needs a dev server (started
                        for you unless --no-serve). Look, then pick.
  --pick <a,b,c>        commit only these candidate indices, in this order.
                        Pass the SAME --seed the preview reported, or you will
                        re-derive a different set and pick from the wrong one.
  --base <url>          dev server the preview renders through
                        (default ${DEFAULT_DEV_BASE})
  --no-serve            refuse rather than starting a dev server for --preview
${COMMON_OPTIONS}

Most rows are one flame. A few play a walk, because a single still cannot show
what the card claims — "roll a whole flame, then steer it" is a path, and so is
"breed two flames". The walk is generated ONCE and stored, so every visitor
sees the same one and a bad roll is fixed by re-running with another seed.

Preview first. Deriving is cheap and deterministic in --seed, so the honest
loop is: --preview to see the candidates, then re-run with the seed it reports
plus --pick to keep the ones worth keeping. The order in --pick is the order
they play, and repeats are allowed.

Composes scripts/gallery-sequence.mjs, which runs the app's own randomiser and
breeder. NOTE: \`put\` clears a row's sequence, because it was derived from the
flame being replaced — so the order is put, then sequence, then capture, then
publish.`,

  delete: `gallery-admin delete — remove a row, and its poster with it

Usage:
  node scripts/gallery-admin.mjs delete --slug <slug> --yes <slug> [options]

Options:
  --slug <slug>         the row to remove
  --yes <slug>          repeat the slug to confirm. Not a bare --yes on
                        purpose: a generic flag gets typed reflexively, and
                        this is the one command with nothing to undo it.
${COMMON_OPTIONS}

The ONLY destructive command here. Everything else is reversible — publish 0
hides a row and publish 1 brings it back — so reach for that first if you are
not certain.

A PUBLISHED row is refused: unpublish it, then delete it. Deleting must not be
a one-step way to take something off Home, or a mistyped slug becomes an
outage instead of an inconvenience.

The R2 poster goes too. The row is removed first and the object second, so a
half-failure leaves an orphaned object (invisible, cheap) rather than a row
pointing at a poster that is gone. If the object delete fails, the exact
command to finish the job is printed — the key exists nowhere else once the
row is gone.`,

  config: `gallery-admin config — Home's settings, as content

Usage:
  node scripts/gallery-admin.mjs config get [--key <key>] [--env ${TARGET_LIST}]
  node scripts/gallery-admin.mjs config set --key <key> --value <value> [options]

Options:
  --key <key>           ${CONFIG_KEY_LIST}
  --value <value>       the value to store (set only)
${COMMON_OPTIONS}

\`get\` prints every stored setting, or just one with --key. \`set\` writes one.

Keys are ALLOWLISTED (scripts/home-config.mjs, mirrored by
src/lib/homeConfig.ts): the table has no CHECK constraint, so a typo'd key
would otherwise be stored happily and read by nobody.

Today the one key is portal_tour_id — which tour Home's "Made here" portal
replays. Tour ids live in code (src/tours/registry.ts), so the value is not
validated against them here; the app falls back to example1-creation for an id
it does not have, which is also what an unset key gets.

Against --env local this creates the schema if it is not there yet, exactly
like \`list\`.`,
}

// ── wrangler / D1 ────────────────────────────────────────────────────

const sqlStr = (value) =>
  value === null || value === undefined
    ? 'NULL'
    : `'${String(value).replace(/'/g, "''")}'`

/** Targets whose schema this run created, so the result can say so. */
const initialized = new Set()

/**
 * The identity of the target, on every result.
 *
 * `storage` is not decoration: local and dev are the SAME database NAME, so a
 * console showing only `env` or only `database` could not tell a local run
 * from one that just wrote to the deployed dev environment.
 */
function targetFields(env) {
  return {
    env,
    storage: TARGETS[env].storage,
    database: TARGETS[env].database,
    ...(initialized.has(env) ? { initialized: true } : {}),
  }
}

/**
 * Create the gallery schema in a LOCAL store, so the caller can retry.
 *
 * Automatic, and local-only, rather than an --init flag. The migration is
 * nothing but `CREATE ... IF NOT EXISTS` against a sqlite file under
 * packages/app/.wrangler that no one else can see, so there is nothing here
 * for a confirmation step to protect — and a first run that fails with "now
 * type this other command" is pure friction on the one target that exists to
 * be frictionless. A remote target gets the error instead: a missing table
 * THERE means something is genuinely wrong, and a content tool must not answer
 * that by writing DDL to a shared database.
 */
function initializeLocal(env) {
  note(
    `${targetLabel(env)} is missing a gallery table — applying ${MIGRATIONS_DIR}/`,
  )
  try {
    execFileSync('pnpm', migrationsArgs(env), {
      cwd: appDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    if (couldNotRun(error)) {
      throw new AdminError(
        'command-not-runnable',
        `Could not run \`pnpm\` — nothing from ${MIGRATIONS_DIR}/ was applied ` +
          `to ${targetLabel(env)}`,
        {
          ...targetFields(env),
          ...couldNotRunDetail('pnpm', error),
          run: initCommand(env),
          cwd: 'packages/app',
        },
      )
    }
    throw new AdminError(
      'init-failed',
      `Could not create the gallery schema in ${targetLabel(env)}`,
      {
        ...targetFields(env),
        run: initCommand(env),
        cwd: 'packages/app',
        stdout: tail(error.stdout),
        stderr: tail(error.stderr),
      },
    )
  }
  initialized.add(env)
  note(`Initialised ${targetLabel(env)} from ${MIGRATIONS_DIR}/`)
}

/**
 * Run SQL through `wrangler d1 execute --json` and return the first
 * statement's rows. Large statements go through a file: a full descriptor is
 * far past a comfortable argv length.
 *
 * `initialize` exists only to stop the local retry below from recursing.
 */
function d1(env, sql, { initialize = true } = {}) {
  const database = TARGETS[env].database
  const args = [
    'exec',
    'wrangler',
    'd1',
    'execute',
    database,
    ...storageFlags(env),
    '--json',
  ]
  let temporaryFile = null
  if (sql.length > 4000) {
    temporaryFile = join(
      mkdtempSync(join(tmpdir(), 'gallery-admin-')),
      'in.sql',
    )
    writeFileSync(temporaryFile, sql)
    args.push(`--file=${temporaryFile}`)
  } else {
    args.push(`--command=${sql}`)
  }

  let stdout
  try {
    stdout = execFileSync('pnpm', args, {
      cwd: appDir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      // wrangler's banner goes to stderr; capture it so it cannot be mistaken
      // for this script's own progress output, and quote it back on failure.
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    // First, because every branch below reads wrangler's output and a child
    // that never started has none: without this, `pnpm` missing from PATH is
    // reported as a query that ran and failed, with an empty stdout and an
    // empty stderr as its entire explanation.
    if (couldNotRun(error)) {
      throw new AdminError(
        'command-not-runnable',
        `Could not run \`pnpm\` — no query reached ${targetLabel(env)}`,
        {
          ...targetFields(env),
          ...couldNotRunDetail('pnpm', error),
          cwd: 'packages/app',
        },
      )
    }
    // Under --json wrangler puts the failure on STDOUT, not stderr — both
    // locally and through the API. Reading only stderr reports "it failed"
    // with no reason attached.
    const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
    if (isMissingTable(output)) {
      if (initialize && TARGETS[env].storage === 'local') {
        initializeLocal(env)
        return d1(env, sql, { initialize: false })
      }
      throw new AdminError(
        'content-db-not-initialized',
        `${targetLabel(env)} is missing a gallery table — the migrations in ` +
          `${MIGRATIONS_DIR}/ were never applied to it`,
        {
          ...targetFields(env),
          run: initCommand(env),
          cwd: 'packages/app',
        },
      )
    }
    throw new AdminError(
      'd1-failed',
      `wrangler d1 execute failed against ${targetLabel(env)}`,
      {
        ...targetFields(env),
        stdout: tail(error.stdout),
        stderr: tail(error.stderr),
        sql: temporaryFile === null ? sql : `(from ${temporaryFile})`,
      },
    )
  }

  // Slice from the first bracket rather than parsing the whole stream: a
  // future banner change on stdout must not break this.
  const start = stdout.indexOf('[')
  if (start < 0) {
    throw new AdminError('d1-no-json', 'wrangler returned no JSON', { stdout })
  }
  const parsed = JSON.parse(stdout.slice(start))
  return { results: parsed[0]?.results ?? [], meta: parsed[0]?.meta ?? null }
}

/** One row's metadata, or null. Never fetches the descriptor blobs. */
function readRow(env, slug) {
  const { results } = d1(
    env,
    `SELECT ${ROW_COLUMNS} FROM gallery_items WHERE slug = ${sqlStr(slug)}`,
  )
  return results[0] ?? null
}

function requireRow(env, slug) {
  const row = readRow(env, slug)
  if (row === null) {
    throw new AdminError(
      'slug-not-found',
      `No row with slug "${slug}" in ${targetLabel(env)}`,
      {
        ...targetFields(env),
        slug,
        hint: 'run `list` to see what exists, or `put` to stage it first',
      },
    )
  }
  return row
}

// ── Validation ───────────────────────────────────────────────────────

function resolveEnv(values) {
  // The default is local on purpose. See the header.
  const env = values.env ?? 'local'
  if (!(env in TARGETS)) {
    throw new AdminError(
      'unknown-env',
      `Unknown --env "${env}" — expected ${TARGET_LIST}`,
      { known: Object.keys(TARGETS) },
    )
  }
  if (env === 'prod' && values.confirm !== 'prod') {
    throw new AdminError(
      'prod-confirmation-required',
      'Touching prod requires --confirm prod as well as --env prod',
      { fix: 'add --confirm prod, or drop --env prod to work locally' },
    )
  }
  return env
}

function validateSlug(slug, source) {
  if (!SLUG_PATTERN.test(slug)) {
    throw new AdminError(
      'invalid-slug',
      `Slug "${slug}" is not URL-safe — the Worker would reject it`,
      {
        slug,
        source,
        pattern: SLUG_PATTERN.source,
        hint: 'lowercase letters, digits and hyphens; 1-64 chars; must not start with a hyphen',
      },
    )
  }
  return slug
}

/** `the-example-flame-red` -> `The Example Flame Red`. */
function titleFromSlug(slug) {
  return slug
    .split('-')
    .filter((word) => word.length > 0)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

// ── Reading a dropped file ───────────────────────────────────────────

const PNG_MAGIC = 0x89504e47

/**
 * Everything `inspect` reports and `put` needs, from one file. Extraction and
 * structural validation are extract-flames.mjs's; this adds the parts specific
 * to becoming a gallery row: the slug, the title, and whether the row could
 * ever render correctly.
 *
 * `blocking` entries are why `put` would refuse. `warnings` are worth saying
 * out loud but do not stop anything.
 */
/**
 * Everything worth knowing about a dropped PNG/JSON, without writing anything.
 *
 * Exported so `gallery-sequence.mjs --append` holds a hand-picked flame to the
 * SAME bar as one staged with `put` — a stripped PNG chunk, an invalid
 * descriptor, or a flame needing custom variations nobody shipped are all
 * caught here rather than surfacing later as a plate that renders wrong.
 */
export function describeSource(path) {
  const warnings = []
  const blocking = []
  const report = {
    file: path,
    fileName: basename(path),
    kind: null,
    accepted: false,
    blocking,
    warnings,
  }

  let bytes
  try {
    bytes = readFileSync(path)
  } catch (error) {
    blocking.push({ code: 'unreadable', message: error.message })
    return report
  }
  report.bytes = bytes.length

  let text = null
  if (bytes.length >= 8 && bytes.readUInt32BE(0) === PNG_MAGIC) {
    report.kind = 'png'
    try {
      text = readFlameChunk(bytes, warnings)
    } catch (error) {
      blocking.push({ code: 'png-unreadable', message: error.message })
      return report
    }
    if (text === null) {
      blocking.push({
        code: 'no-flame-chunk',
        message:
          'PNG carries no FlameJson chunk — it was not exported by the app, ' +
          'or the chunk was stripped by an editor',
      })
      return report
    }
  } else {
    report.kind = 'json'
    text = bytes.toString('utf8')
  }

  let normalized
  try {
    normalized = normalizeEnvelope(JSON.parse(text))
  } catch (error) {
    blocking.push({ code: 'bad-payload', message: error.message })
    return report
  }

  const flame = normalized.flame
  const flameReport = inspectFlame(flame)
  for (const message of flameReport.errors) {
    blocking.push({ code: 'invalid-flame', message })
  }
  warnings.push(...flameReport.warnings)

  const metadata = isPlainObject(flame?.metadata) ? flame.metadata : {}
  const slug = toSlug(basename(path))
  const name = typeof metadata.name === 'string' ? metadata.name : ''
  const animation = normalized.animation

  Object.assign(report, {
    slug,
    title: name.length > 0 ? name : titleFromSlug(slug),
    flameName: name,
    author: typeof metadata.author === 'string' ? metadata.author : null,
    schemaVersion: typeof flame?.version === 'string' ? flame.version : null,
    dimensions: flameReport.dimensions ?? 2,
    transformCount: flameReport.transformCount ?? 0,
    variationCount: flameReport.variationCount ?? 0,
    hasAnimation: animation !== null,
    animationTrackCount: Array.isArray(animation?.tracks)
      ? animation.tracks.length
      : 0,
    customVariationTypes: flameReport.customTypes ?? [],
  })

  if (blocking.length === 0) {
    report.transformsHash = transformsHash(flame.transforms)
  }
  if (name.length === 0) {
    warnings.push(
      'flame has no metadata.name — title derived from the filename',
    )
  }

  // A custom variation lives in the author's browser, not in the flame. The
  // gallery row has nowhere to carry its WGSL either (see the schema), so a
  // flame that needs one renders as the identity fallback for every visitor —
  // a different picture from the one that was exported.
  const customTypes = flameReport.customTypes ?? []
  if (customTypes.length > 0) {
    const definitions = Array.isArray(normalized.customVariations)
      ? normalized.customVariations
      : isPlainObject(normalized.customVariations)
        ? Object.values(normalized.customVariations)
        : []
    const defined = new Set(
      definitions
        .filter((def) => isPlainObject(def) && typeof def.id === 'string')
        .map((def) => def.id),
    )
    const missing = customTypes.filter((type) => !defined.has(type))
    blocking.push(
      missing.length > 0
        ? {
            code: 'custom-variations-missing',
            message:
              'references custom variations with no definitions: ' +
              `${missing.join(', ')} — this flame would render wrong`,
          }
        : {
            code: 'custom-variations-unstorable',
            message:
              'references custom variations: ' +
              `${customTypes.join(', ')} — gallery_items has no column for ` +
              'their WGSL, so the definitions would be dropped and the flame ' +
              'would render wrong',
          },
    )
  }

  report.accepted = blocking.length === 0
  if (report.accepted) {
    // Not part of the report — `put` needs them, `inspect` strips them.
    report.flame = flame
    report.animation = animation
  }
  return report
}

/** The report minus the payloads, which are far too big to print. */
function publicReport(report) {
  const { flame: _flame, animation: _animation, ...rest } = report
  return rest
}

// ── list ─────────────────────────────────────────────────────────────

function commandList(values) {
  const env = resolveEnv(values)
  note(`Reading ${targetLabel(env)} ...`)
  const { results } = d1(
    env,
    `SELECT ${ROW_COLUMNS} FROM gallery_items ORDER BY section, sort_order, slug`,
  )

  const sections = {}
  for (const section of SECTIONS) {
    sections[section] = { total: 0, published: 0, withPoster: 0 }
  }
  for (const row of results) {
    const bucket = (sections[row.section] ??= {
      total: 0,
      published: 0,
      withPoster: 0,
    })
    bucket.total += 1
    if (row.published === 1) bucket.published += 1
    if (row.poster_key !== null) bucket.withPoster += 1
  }

  const summary = Object.entries(sections)
    .map(([section, counts]) => `${section} ${counts.total}`)
    .join(', ')
  note(`${results.length} row(s) in ${targetLabel(env)}: ${summary}`)
  return {
    ...targetFields(env),
    count: results.length,
    sections,
    items: results,
  }
}

// ── audit ───────────────────────────────────────────────────────────

function commandAudit(values) {
  const env = resolveEnv(values)
  note(`Auditing published rows in ${targetLabel(env)} (read-only) ...`)
  const { results } = d1(
    env,
    `SELECT ${ROW_COLUMNS} FROM gallery_items WHERE published = 1 ` +
      'ORDER BY section, sort_order, slug',
    // An audit must remain observational even against an empty local store.
    { initialize: false },
  )

  const unresolved = results.flatMap((row) => {
    const { blockers } = publicationReadiness(row, { remote: true })
    return blockers.length === 0
      ? []
      : [{ slug: row.slug, title: row.title, blockers }]
  })
  note(
    unresolved.length === 0
      ? `${results.length} published row(s) are ready.`
      : `${unresolved.length}/${results.length} published row(s) need attention.`,
  )

  return {
    ok: unresolved.length === 0,
    ...targetFields(env),
    readOnly: true,
    publishedCount: results.length,
    unresolvedCount: unresolved.length,
    items: unresolved,
  }
}

// ── inspect ──────────────────────────────────────────────────────────

function commandInspect(values) {
  const files = values.file ?? []
  if (files.length === 0) {
    throw new AdminError('usage', 'inspect needs at least one --file')
  }
  const reports = files.map((file) => {
    const path = resolve(process.cwd(), file)
    note(`Inspecting ${path} ...`)
    const report = describeSource(path)
    const animated = report.hasAnimation === true ? ', animated' : ''
    const warned =
      report.warnings.length > 0 ? `, ${report.warnings.length} warning(s)` : ''
    note(
      report.accepted
        ? `  ok: ${report.slug} — ${report.transformCount} transform(s), ${report.dimensions}D${animated}${warned}`
        : `  rejected: ${report.blocking.map((issue) => issue.code).join(', ')}`,
    )
    return publicReport(report)
  })

  const rejected = reports.filter((report) => !report.accepted)
  return {
    ok: rejected.length === 0,
    count: reports.length,
    acceptedCount: reports.length - rejected.length,
    rejectedCount: rejected.length,
    files: reports,
  }
}

// ── put ──────────────────────────────────────────────────────────────

function commandPut(values) {
  const env = resolveEnv(values)
  const files = values.file ?? []
  if (files.length !== 1) {
    throw new AdminError(
      'usage',
      `put takes exactly one --file (got ${files.length})`,
      {
        hint: 'stage one flame per call so --slug and --title stay unambiguous',
      },
    )
  }
  const section = values.section
  if (section === undefined || !SECTIONS.includes(section)) {
    throw new AdminError(
      'invalid-section',
      `--section must be one of ${SECTIONS.join(', ')}`,
      { given: section ?? null },
    )
  }

  const warnings = []
  let capability = values.capability ?? null
  if (section === 'capability') {
    if (capability === null) {
      throw new AdminError(
        'capability-required',
        '--section capability needs --capability <name>',
        { known: CAPABILITIES },
      )
    }
    if (!CAPABILITIES.includes(capability)) {
      warnings.push(
        `capability "${capability}" is not one of ${CAPABILITIES.join(', ')} — ` +
          'Home may not have a label for it',
      )
    }
  } else if (capability !== null) {
    throw new AdminError(
      'capability-not-allowed',
      `--capability only applies to --section capability, not "${section}"`,
    )
  }

  const path = resolve(process.cwd(), files[0])
  note(`Reading ${path} ...`)
  const source = describeSource(path)
  if (!source.accepted) {
    const reasons = source.blocking.map((issue) => issue.message).join('; ')
    throw new AdminError(
      'source-rejected',
      `${basename(path)} cannot become a gallery row: ${reasons}`,
      publicReport(source),
    )
  }
  warnings.push(...source.warnings)

  const slug = validateSlug(
    values.slug ?? source.slug,
    values.slug === undefined ? 'derived from filename' : '--slug',
  )
  const title = values.title ?? source.title
  const caption = values.caption ?? null
  const author = values.author ?? source.author
  const collection = values.collection ?? 'original'
  const provenance = values.provenance ?? 'unknown'
  if (!GALLERY_COLLECTIONS.includes(collection)) {
    throw new AdminError(
      'invalid-collection',
      `--collection must be one of ${GALLERY_COLLECTIONS.join(', ')}`,
      { given: collection },
    )
  }
  if (!PROVENANCE_KINDS.includes(provenance)) {
    throw new AdminError(
      'invalid-provenance',
      `--provenance must be one of ${PROVENANCE_KINDS.join(', ')}`,
      { given: provenance },
    )
  }

  const existing = readRow(env, slug)
  if (existing !== null) {
    note(`Slug ${slug} already exists — upserting (published resets to 0)`)
    if (existing.published === 1) {
      warnings.push(
        `${slug} was published; put stages, so it is now hidden until you ` +
          'run `publish --published 1` again',
      )
    }
    if (existing.has_sequence === 1) {
      warnings.push(
        `${slug} had a curated sequence derived from the flame you just ` +
          'replaced, so it was cleared — the card rests on one still until ' +
          'you re-run scripts/gallery-sequence.mjs',
      )
    }
  }
  if (section === 'hero') {
    const { results } = d1(
      env,
      `SELECT slug FROM gallery_items WHERE section = 'hero' AND slug <> ${sqlStr(slug)}`,
    )
    if (results.length > 0) {
      warnings.push(
        `hero already holds ${results.map((row) => row.slug).join(', ')} — ` +
          'Home shows one hero, so unpublish the other before publishing this',
      )
    }
  }

  const flameJson = JSON.stringify(source.flame)
  const animationJson =
    source.animation === null ? null : JSON.stringify(source.animation)

  // sort_order is resolved in SQL so a concurrent put cannot land on the same
  // position, and is deliberately NOT part of the conflict update: re-staging
  // an existing row must not move it.
  const sql = `INSERT INTO gallery_items (
  slug, title, caption, author, section, capability, flame, animation,
  collection, provenance_kind, source_url, license, license_url, attribution,
  changes, original_id,
  dimensions, transform_count, poster_key, poster_width, poster_height,
  poster_frame, sort_order, published
) VALUES (
  ${sqlStr(slug)}, ${sqlStr(title)}, ${sqlStr(caption)}, ${sqlStr(author)},
  ${sqlStr(section)}, ${sqlStr(capability)},
  ${sqlStr(flameJson)}, ${sqlStr(animationJson)},
  ${sqlStr(collection)}, ${sqlStr(provenance)},
  ${sqlStr(values['source-url'] ?? null)}, ${sqlStr(values.license ?? null)},
  ${sqlStr(values['license-url'] ?? null)}, ${sqlStr(values.attribution ?? null)},
  ${sqlStr(values.changes ?? null)}, ${sqlStr(values['original-id'] ?? null)},
  ${source.dimensions}, ${source.transformCount},
  NULL, NULL, NULL, NULL,
  (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM gallery_items
    WHERE section = ${sqlStr(section)}),
  0
)
ON CONFLICT(slug) DO UPDATE SET
  title = excluded.title,
  caption = excluded.caption,
  author = excluded.author,
  section = excluded.section,
  capability = excluded.capability,
  collection = excluded.collection,
  provenance_kind = excluded.provenance_kind,
  source_url = excluded.source_url,
  license = excluded.license,
  license_url = excluded.license_url,
  attribution = excluded.attribution,
  changes = excluded.changes,
  original_id = excluded.original_id,
  flame = excluded.flame,
  animation = excluded.animation,
  dimensions = excluded.dimensions,
  transform_count = excluded.transform_count,
  poster_key = NULL,
  poster_width = NULL,
  poster_height = NULL,
  -- Re-staging replaces the flame, so the frame the old poster was captured at
  -- describes nothing that still exists. Left behind, it would tell Home a new
  -- poster's frame is known when it is not.
  poster_frame = NULL,
  -- Same reasoning, and the same trap: a curated sequence is DERIVED from the
  -- flame being replaced here (the mutation walk for cap-randomizer, the
  -- crossover children for cap-genetics). Kept, the card would open on the new
  -- flame and then play a path belonging to the old one -- which looks like a
  -- rendering bug rather than stale content. Cleared, the row is simply "one
  -- flame" again until scripts/gallery-sequence.mjs is re-run.
  sequence = NULL,
  published = 0;
`

  const kib = (flameJson.length / 1024).toFixed(1)
  note(`Staging ${slug} into ${targetLabel(env)} (${kib} KiB descriptor) ...`)
  d1(env, sql)
  const row = requireRow(env, slug)
  note(`Staged ${slug} in section ${row.section} at order ${row.sort_order}`)

  const prodConfirmation = env === 'prod' ? ' --confirm prod' : ''

  return {
    ...targetFields(env),
    slug,
    action: existing === null ? 'inserted' : 'updated',
    staged: true,
    source: publicReport(source),
    row,
    warnings,
    next: [
      `node scripts/gallery-admin.mjs capture --env ${env} --slug ${slug}${prodConfirmation}`,
      ...(existing?.has_sequence === 1
        ? [
            `node scripts/gallery-sequence.mjs ${slug} --apply ${env}${
              capability === 'genetics' ? ' --mode breed --derived 5' : ''
            }${prodConfirmation}`,
          ]
        : []),
      `node scripts/gallery-admin.mjs publish --env ${env} --slug ${slug} --published 1${prodConfirmation}`,
    ],
  }
}

// ── publish ──────────────────────────────────────────────────────────

function commandPublish(values) {
  const env = resolveEnv(values)
  if (values.slug === undefined) {
    throw new AdminError('usage', 'publish needs --slug')
  }
  const slug = validateSlug(values.slug, '--slug')
  if (values.published !== '0' && values.published !== '1') {
    throw new AdminError(
      'usage',
      '--published must be 0 (hide) or 1 (show on Home)',
      { given: values.published ?? null },
    )
  }
  const published = Number(values.published)

  const before = requireRow(env, slug)
  const warnings = []
  if (published === 1) {
    const readiness = publicationReadiness(before, {
      remote: TARGETS[env].storage === 'remote',
    })
    if (readiness.blockers.length > 0) {
      throw new AdminError(
        'publication-blocked',
        `${slug} is not ready for shared publication`,
        {
          ...targetFields(env),
          slug,
          blockers: readiness.blockers,
          hint: `stage complete metadata, then run capture --env ${env} --slug ${slug}`,
        },
      )
    }
    warnings.push(...readiness.warnings.map((entry) => entry.message))
  }
  if (before.published === published) {
    warnings.push(`${slug} was already published = ${published}`)
  }

  note(`Setting published = ${published} on ${slug} in ${targetLabel(env)} ...`)
  d1(
    env,
    `UPDATE gallery_items SET published = ${published} WHERE slug = ${sqlStr(slug)}`,
  )
  const row = requireRow(env, slug)
  note(published === 1 ? `${slug} is live` : `${slug} is hidden`)

  return {
    ...targetFields(env),
    slug,
    published: row.published,
    changed: before.published !== row.published,
    previous: { published: before.published },
    row,
    warnings,
  }
}

// ── reorder ──────────────────────────────────────────────────────────

function commandReorder(values) {
  const env = resolveEnv(values)
  if (values.slug === undefined) {
    throw new AdminError('usage', 'reorder needs --slug')
  }
  const slug = validateSlug(values.slug, '--slug')
  const order = Number(values.order)
  if (values.order === undefined || !Number.isInteger(order)) {
    throw new AdminError('usage', '--order must be an integer', {
      given: values.order ?? null,
    })
  }

  const before = requireRow(env, slug)
  note(`Setting sort_order = ${order} on ${slug} in ${targetLabel(env)} ...`)
  d1(
    env,
    `UPDATE gallery_items SET sort_order = ${order} WHERE slug = ${sqlStr(slug)}`,
  )
  const row = requireRow(env, slug)

  // Print the section back so a collision is obvious rather than latent: ties
  // break on slug, which is stable but rarely what was intended.
  const { results } = d1(
    env,
    'SELECT slug, sort_order, published FROM gallery_items WHERE section = ' +
      `${sqlStr(row.section)} ORDER BY sort_order, slug`,
  )
  const warnings = []
  const clash = results.filter(
    (other) => other.sort_order === order && other.slug !== slug,
  )
  if (clash.length > 0) {
    warnings.push(
      `sort_order ${order} is shared with ${clash.map((o) => o.slug).join(', ')} ` +
        'in the same section — order then falls back to the slug',
    )
  }
  note(
    `${row.section}: ${results.map((o) => `${o.sort_order}:${o.slug}`).join('  ')}`,
  )

  return {
    ...targetFields(env),
    slug,
    section: row.section,
    order: row.sort_order,
    changed: before.sort_order !== row.sort_order,
    previous: { order: before.sort_order },
    sectionOrder: results,
    warnings,
  }
}

// ── config ───────────────────────────────────────────────────────────

/** Every stored setting, as `{ key: value }`. */
function readConfig(env) {
  const { results } = d1(env, 'SELECT key, value FROM home_config ORDER BY key')
  const config = {}
  for (const row of results) {
    config[row.key] = row.value
  }
  return config
}

/**
 * Read or write `home_config` — the settings the app fetches from
 * `/api/gallery/config`.
 *
 * `config get` / `config set` rather than two subcommands, because they are one
 * concept and the console that drives this will offer them as one control. The
 * action is a positional (the only one in this script) since `--action get`
 * reads worse than what every other CLI in the world spells `config get`.
 */
function commandConfig(values, positionals) {
  const env = resolveEnv(values)
  const [action] = positionals
  if (action !== 'get' && action !== 'set') {
    throw new AdminError(
      'usage',
      `config takes an action: get or set (got ${action === undefined ? 'none' : `"${action}"`})`,
      { actions: ['get', 'set'] },
    )
  }

  // Allowlisted BEFORE anything touches the database, so a typo costs a
  // wrangler round trip rather than becoming a row nothing reads.
  const key = values.key
  if (key !== undefined) {
    const problem = checkConfigEntry(
      key,
      action === 'set' ? values.value : undefined,
    )
    if (problem !== null) {
      throw new AdminError(problem.code, problem.message, problem.detail)
    }
  }

  if (action === 'get') {
    if (values.value !== undefined) {
      throw new AdminError('usage', 'config get does not take --value')
    }
    note(`Reading home_config in ${targetLabel(env)} ...`)
    const config = readConfig(env)
    const selected = key === undefined ? config : { [key]: config[key] ?? null }
    for (const [name, value] of Object.entries(selected)) {
      note(`  ${name} = ${value === null ? '(unset)' : value}`)
    }
    return {
      ...targetFields(env),
      action,
      config: selected,
      // What the app would do with what is stored right now, so a reader does
      // not have to know the fallback rule to predict the portal.
      known: Object.keys(CONFIG_KEYS),
    }
  }

  if (key === undefined) {
    throw new AdminError('usage', `config set needs --key (${CONFIG_KEY_LIST})`)
  }
  if (values.value === undefined) {
    throw new AdminError('usage', 'config set needs --value')
  }
  const value = values.value

  const before = readConfig(env)
  note(`Setting ${key} = ${value} in ${targetLabel(env)} ...`)
  // Upsert: a settings key has exactly one row, and the trigger in 0003 keeps
  // updated_at honest on the update branch.
  d1(
    env,
    `INSERT INTO home_config (key, value) VALUES (${sqlStr(key)}, ${sqlStr(value)}) ` +
      `ON CONFLICT(key) DO UPDATE SET value = ${sqlStr(value)}`,
  )
  const config = readConfig(env)

  const warnings = []
  if (before[key] === value) {
    warnings.push(`${key} was already ${value}`)
  }
  if (key === 'portal_tour_id') {
    warnings.push(
      'tour ids are code — if this build has no tour with that id, Home falls ' +
        'back to example1-creation rather than failing',
    )
  }
  note(`${key} is now ${config[key]}`)

  return {
    ...targetFields(env),
    action,
    key,
    value: config[key],
    changed: before[key] !== config[key],
    previous: { value: before[key] ?? null },
    config,
    warnings,
  }
}

// ── capture ──────────────────────────────────────────────────────────

/**
 * Refuse to capture through a dev server belonging to a different worktree.
 *
 * A wrong poster is worse than no poster: it is a plausible image rendered by
 * code that is not the code under test, and it looks exactly like a correct one.
 * So this throws rather than warns. Returns the confirmed checkout path.
 */
async function assertOwnCheckout(base) {
  const result = await verifyServedCheckout({ base, appDir })
  const failure = checkoutFailure({ base, appDir, result })
  if (failure !== null) {
    throw new AdminError(failure.code, failure.message, failure.detail)
  }
  return result.served ?? appDir
}

/**
 * Guarantee a reachable capture page, or fail with something actionable.
 *
 * Starting the server here rather than telling the caller to do it is the
 * whole point: the console that drives this script is a daemon with no
 * terminal to run `pnpm start` in, and an unattended run that dies on a
 * connection refused two minutes into a capture is exactly the obscure
 * timeout this is meant to avoid. --no-serve opts out.
 *
 * A server that is ALREADY up gets reused, but only after it proves it is
 * serving this checkout: see scripts/dev-server-checkout.mjs for what goes
 * wrong otherwise, and note that the reuse line now names the tree it found.
 */
async function ensureDevServer({ base, autoStart, timeoutMs }) {
  const status = await probeCapturePage(base)
  if (status === 200) {
    const checkout = await assertOwnCheckout(base)
    note(`Dev server already serving ${base}${CAPTURE_PAGE} from ${checkout}`)
    return { mode: 'existing', base, checkout, stop: async () => {} }
  }

  if (!autoStart) {
    throw new AdminError(
      'dev-server-unavailable',
      `Nothing is serving ${base}${CAPTURE_PAGE} and --no-serve was given`,
      {
        base,
        run: DEV_SERVER_COMMAND,
        hint: `start it in another terminal, then re-run without --no-serve`,
      },
    )
  }

  const port = Number(new URL(base).port || '5173')
  note(`No dev server on ${base} — starting ${DEV_SERVER_COMMAND} ...`)
  // detached so the child gets its own process group: `pnpm start` spawns
  // vite, and killing only pnpm would leave the server holding the port.
  // --strictPort so a port already taken by something else fails loudly here
  // instead of silently starting vite somewhere this script is not looking.
  const child = spawn(
    'pnpm',
    [
      '--filter',
      'chaos-master',
      'start',
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd: repoRoot, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )

  const log = []
  const ports = new Set()
  // Set the moment WE decide to shut the server down. Everything the child says
  // from then on is its own death rattle — pnpm reports the SIGTERM we just sent
  // as ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL, which reads like a capture failure at
  // the very end of a successful run. Still collected into `log`, so a crash
  // DURING teardown is recoverable; just not narrated as news.
  let stopping = false
  const collect = (chunk) => {
    for (const line of String(chunk).split('\n')) {
      const text = line.trimEnd()
      if (text.length === 0) continue
      log.push(text)
      if (log.length > 60) log.shift()
      if (!stopping && !isQrBanner(text)) note(`  [dev] ${text}`)
      const match = SERVER_URL.exec(text.replace(PRINTABLE_ONLY, ''))
      if (match !== null) ports.add(Number(match[1]))
    }
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)

  let exited = null
  child.on('exit', (code, signal) => {
    exited = { code, signal }
  })

  const stop = async () => {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    if (exited !== null || child.pid === undefined) return
    stopping = true
    note('Stopping the dev server ...')
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // Already gone, or never got a process group — nothing to stop.
    }
    for (let i = 0; i < 50 && exited === null; i++) await delay(100)
    if (exited === null) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // Same: the group is gone by the time we get here.
      }
    }
  }

  // Ctrl-C must not leave a dev server this script started behind.
  function onSignal() {
    void stop().then(() => process.exit(130))
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (exited !== null) {
      await stop()
      throw new AdminError(
        'dev-server-failed',
        `${DEV_SERVER_COMMAND} exited before the capture page came up`,
        { exit: exited, run: DEV_SERVER_COMMAND, log: log.slice(-20) },
      )
    }
    // --strictPort should make this impossible, but a server listening
    // somewhere this script is not looking is precisely how a run ends in an
    // unexplained timeout. Say so in a second instead of in three minutes.
    const elsewhere = [...ports].find((seen) => seen !== port)
    if (elsewhere !== undefined) {
      await stop()
      throw new AdminError(
        'dev-server-port-mismatch',
        `The dev server started on port ${elsewhere}, not the requested ${port}`,
        {
          expected: port,
          actual: elsewhere,
          hint: `re-run with --base https://localhost:${elsewhere}`,
          log: log.slice(-20),
        },
      )
    }
    if ((await probeCapturePage(base, 2000)) === 200) {
      // Spawned from repoRoot, so this can only fail if something else grabbed
      // the port first — which --strictPort should have caught. Check anyway:
      // it costs one request and it is the whole point of the guard.
      let checkout
      try {
        checkout = await assertOwnCheckout(base)
      } catch (error) {
        await stop()
        throw error
      }
      note(`Dev server ready at ${base}, serving ${checkout}`)
      return { mode: 'started', base, checkout, stop }
    }
    await delay(1000)
  }

  await stop()
  throw new AdminError(
    'dev-server-timeout',
    `${base}${CAPTURE_PAGE} did not answer within ${timeoutMs}ms`,
    { base, run: DEV_SERVER_COMMAND, log: log.slice(-20) },
  )
}

/** Run a sibling script, sending its progress to OUR stderr. */
function runScript(name, scriptArgs) {
  note(`> node scripts/${name} ${scriptArgs.join(' ')}`)
  return new Promise((settle, reject) => {
    const child = spawn('node', [join(scriptDir, name), ...scriptArgs], {
      cwd: appDir,
      // fd 2 for the child's stdout as well: its progress must never end up in
      // this script's single JSON result.
      stdio: ['ignore', 2, 2],
    })
    child.on('error', reject)
    child.on('close', (code) => {
      settle(code ?? 1)
    })
  })
}

function resolveCaptureSlugs(env, values) {
  const explicit = (values.slug ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  const allMissing = values['all-missing'] === true

  if (explicit.length > 0 && allMissing) {
    throw new AdminError(
      'usage',
      'pass either --slug or --all-missing, not both',
    )
  }
  if (explicit.length === 0 && !allMissing) {
    throw new AdminError('usage', 'capture needs --slug a,b or --all-missing')
  }

  if (allMissing) {
    // "Missing" is not only a missing poster. An ANIMATED row whose poster
    // predates the poster_frame column has an image but no record of which
    // frame it is, and Home cannot go live from that — it keeps such a plate on
    // its poster (see needsPosterFrame in src/lib/galleryContent.ts). A
    // re-capture is what fixes it: the capture resolves the frame again and the
    // upload stores it alongside the new key. Backfilling those rows is the
    // whole reason this reads more than poster_key.
    const { results } = d1(
      env,
      'SELECT slug FROM gallery_items WHERE poster_key IS NULL ' +
        'OR (animation IS NOT NULL AND poster_frame IS NULL) ' +
        'ORDER BY section, sort_order, slug',
    )
    return results.map((row) => row.slug)
  }

  for (const slug of explicit) validateSlug(slug, '--slug')
  const { results } = d1(
    env,
    `SELECT slug FROM gallery_items WHERE slug IN (${explicit.map(sqlStr).join(', ')})`,
  )
  const found = new Set(results.map((row) => row.slug))
  const unknown = explicit.filter((slug) => !found.has(slug))
  if (unknown.length > 0) {
    throw new AdminError(
      'slug-not-found',
      `No row in ${targetLabel(env)} for ${unknown.join(', ')}`,
      { ...targetFields(env), unknown, hint: 'stage it with `put` first' },
    )
  }
  return explicit
}

async function commandCapture(values) {
  const env = resolveEnv(values)
  const slugs = resolveCaptureSlugs(env, values)
  const outDir =
    values.out === undefined
      ? DEFAULT_POSTER_DIR
      : resolve(process.cwd(), values.out)
  const base = (values.base ?? DEFAULT_DEV_BASE).replace(/\/$/, '')

  if (slugs.length === 0) {
    note('Every row already has a poster — nothing to capture.')
    return {
      ...targetFields(env),
      bucket: TARGETS[env].bucket,
      requested: [],
      captured: [],
      failed: [],
      devServer: null,
      out: outDir,
    }
  }
  note(
    `Capturing ${slugs.length} poster(s) from ${targetLabel(env)}: ${slugs.join(', ')}`,
  )

  const timeoutMs =
    values.timeout === undefined
      ? DEV_SERVER_TIMEOUT_MS
      : Number(values.timeout)
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new AdminError('usage', '--timeout must be a positive number of ms')
  }

  const startedAt = Date.now()
  const server = await ensureDevServer({
    base,
    autoStart: values['no-serve'] !== true,
    timeoutMs,
  })

  let captureExit
  let uploadExit = null
  try {
    captureExit = await runScript('capture-gallery-posters.mjs', [
      '--env',
      env,
      '--slug',
      slugs.join(','),
      // Staged rows are unpublished by definition, and they are exactly the
      // ones that still need a poster.
      '--include-unpublished',
      '--out',
      outDir,
      '--base',
      server.base,
    ])
  } finally {
    await server.stop()
  }

  const manifestPath = join(outDir, 'manifest.json')
  const posters = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')).posters ?? [])
    : []
  const wanted = new Set(slugs)
  const captured = posters.filter(
    (poster) =>
      wanted.has(poster.slug) && Date.parse(poster.capturedAt) >= startedAt,
  )

  if (captured.length > 0) {
    const uploadArgs = [
      '--env',
      env,
      '--slug',
      captured.map((poster) => poster.slug).join(','),
      '--in',
      outDir,
    ]
    if (env === 'prod') uploadArgs.push('--confirm', 'prod')
    uploadExit = await runScript('upload-gallery-posters.mjs', uploadArgs)
  }

  const { results: rows } = d1(
    env,
    'SELECT slug, poster_key, poster_width, poster_height, poster_frame, ' +
      `published FROM gallery_items WHERE slug IN (${slugs.map(sqlStr).join(', ')}) ` +
      'ORDER BY slug',
  )
  const failed = rows
    .filter((row) => row.poster_key === null)
    .map((row) => row.slug)

  const result = {
    ...targetFields(env),
    // The poster half of the target: a local capture uploads into the same
    // bucket NAME, but into wrangler's local store rather than R2 itself.
    bucket: TARGETS[env].bucket,
    devServer: {
      mode: server.mode,
      base: server.base,
      // Which tree rendered these posters. A reused server is only ever this
      // one now, but saying so is what makes the log self-explanatory later.
      checkout: server.checkout,
    },
    out: outDir,
    requested: slugs,
    captured: captured.map((poster) => ({
      slug: poster.slug,
      file: poster.file,
      bytes: poster.bytes,
      width: poster.width,
      height: poster.height,
      mimeType: poster.mimeType,
    })),
    rows,
    failed,
    exitCodes: { capture: captureExit, upload: uploadExit },
  }
  if (failed.length > 0) {
    result.ok = false
    result.error = {
      code: 'capture-incomplete',
      message: `${failed.length} row(s) still have no poster: ${failed.join(', ')}`,
      detail: {
        failed,
        hint: 'the capture log above says why each one failed',
      },
    }
  }
  const missing =
    failed.length > 0 ? `; still missing: ${failed.join(', ')}` : ''
  note(`Captured ${captured.length}/${slugs.length} poster(s)${missing}`)
  return result
}

// ── poster ───────────────────────────────────────────────────────────

// Poster keys carry their format in the extension; the bucket is not asked.
const MIME_BY_EXT = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
}

/**
 * Hand back a row's captured poster, as base64.
 *
 * Exists for `local` above all. dev and prod serve posters over HTTP already
 * (`GET /api/gallery/poster/<key>` on the deployed Worker), so anything with a
 * browser can just point an <img> at those and get caching for free. The local
 * bucket is inside miniflare and has no URL at all unless a dev server happens
 * to be running — which is a heavy thing to require for a thumbnail.
 *
 * Reads nothing but R2: a row must already have been captured. Rendering a
 * flame that has no poster is a different, far more expensive operation.
 */
function commandPoster(values) {
  const env = resolveEnv(values)
  if (values.slug === undefined) {
    throw new AdminError('usage', 'poster needs --slug')
  }
  const slug = values.slug
  if (!SLUG_PATTERN.test(slug)) {
    throw new AdminError('bad-slug', `"${slug}" is not a valid slug`)
  }
  const row = requireRow(env, slug)
  if (!row.poster_key) {
    throw new AdminError(
      'no-poster',
      `"${slug}" has no poster yet — there is nothing to show`,
      {
        ...targetFields(env),
        slug,
        fix: `node scripts/gallery-admin.mjs capture --slug ${slug} --env ${env}`,
      },
    )
  }

  let bytes
  try {
    bytes = execFileSync(
      'pnpm',
      [
        'exec',
        'wrangler',
        'r2',
        'object',
        'get',
        `${TARGETS[env].bucket}/gallery/${row.poster_key}`,
        // --pipe puts the object on stdout and silences wrangler's banner,
        // which would otherwise be prepended to the image bytes.
        '--pipe',
        ...storageFlags(env),
      ],
      {
        cwd: appDir,
        // No encoding: this is an image, and decoding it as utf8 would corrupt
        // every byte above 0x7f.
        encoding: 'buffer',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
  } catch (error) {
    throw new AdminError(
      'poster-unreadable',
      `Could not read ${row.poster_key} from ${TARGETS[env].bucket}`,
      {
        ...targetFields(env),
        slug,
        posterKey: row.poster_key,
        cause: tail(String(error.stderr ?? '')) || 'no output',
        hint: 'the row names a poster the bucket does not have — re-capture it',
      },
    )
  }

  return {
    ...targetFields(env),
    slug,
    posterKey: row.poster_key,
    width: row.poster_width,
    height: row.poster_height,
    bytes: bytes.length,
    mimeType:
      MIME_BY_EXT[extname(row.poster_key).toLowerCase()] ?? 'image/webp',
    base64: bytes.toString('base64'),
  }
}

// ── delete ───────────────────────────────────────────────────────────

/**
 * Remove a row from the gallery, and its poster with it.
 *
 * Every other write here is reversible — `publish 0` hides a row and `publish
 * 1` brings it back. This one is not, so it is guarded three ways:
 *
 *   1. a PUBLISHED row is refused outright. Unpublish it first. Deleting must
 *      never be the one-step way to take something off Home, because then a
 *      mistyped slug is an outage rather than an inconvenience.
 *   2. `--yes <slug>` must repeat the slug exactly. A generic confirmation
 *      flag would be typed reflexively; retyping the name means the thing you
 *      confirmed is the thing that goes.
 *   3. prod still needs its own `--confirm prod`, as everywhere else.
 */
function commandDelete(values) {
  const env = resolveEnv(values)
  if (values.slug === undefined) {
    throw new AdminError('usage', 'delete needs --slug')
  }
  const slug = values.slug
  if (!SLUG_PATTERN.test(slug)) {
    throw new AdminError('bad-slug', `"${slug}" is not a valid slug`)
  }
  const row = requireRow(env, slug)

  if (row.published === 1) {
    throw new AdminError(
      'refuses-published',
      `"${slug}" is live on Home — unpublish it before deleting it`,
      {
        ...targetFields(env),
        slug,
        fix: `node scripts/gallery-admin.mjs publish --slug ${slug} --published 0 --env ${env}`,
        why: 'deleting must not be a one-step way to take a row off Home',
      },
    )
  }

  if (values.yes !== slug) {
    throw new AdminError(
      'delete-confirmation-required',
      `Deleting "${slug}" is not reversible — repeat the slug to confirm`,
      {
        ...targetFields(env),
        slug,
        fix: `add --yes ${slug}`,
        alternative: `publish --published 0 hides a row without destroying it`,
      },
    )
  }

  // Read the key BEFORE the row goes: it is recorded nowhere else, so losing
  // it here would leave an R2 object nobody can ever name again.
  const posterKey = row.poster_key ?? null

  note(`Deleting ${slug} from ${targetLabel(env)} ...`)
  d1(env, `DELETE FROM gallery_items WHERE slug = ${sqlStr(slug)};`)

  // Row first, object second, deliberately. If this half fails we are left
  // with an orphaned object — invisible and cheap — rather than a row pointing
  // at a poster that no longer exists. The key is printed either way so a
  // failure here stays fixable by hand.
  let posterDeleted = null
  if (posterKey !== null) {
    try {
      execFileSync(
        'pnpm',
        [
          'exec',
          'wrangler',
          'r2',
          'object',
          'delete',
          `${TARGETS[env].bucket}/gallery/${posterKey}`,
          ...storageFlags(env),
        ],
        { cwd: appDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      )
      posterDeleted = true
      note(`Deleted its poster ${posterKey}.`)
    } catch (error) {
      posterDeleted = false
      note(
        `WARNING: the row is gone but its poster is not. Remove it with:\n` +
          `  pnpm exec wrangler r2 object delete ${TARGETS[env].bucket}/gallery/${posterKey} ${storageFlags(env).join(' ')}\n` +
          `  (${tail(error.stderr ?? '') || 'no output'})`,
      )
    }
  }

  return {
    ...targetFields(env),
    slug,
    deleted: true,
    title: row.title,
    posterKey,
    posterDeleted,
  }
}

// ── sequence ─────────────────────────────────────────────────────────

/**
 * Give a row a curated flame SEQUENCE, or clear it.
 *
 * Composes `gallery-sequence.mjs` rather than reimplementing it, exactly as
 * `capture` composes the poster pipeline: that script is the only piece of
 * gallery tooling that has to run the app's own TypeScript (the randomiser and
 * the breeder), and duplicating that here would guarantee drift.
 *
 * It exists as a subcommand purely so the console can reach it — the wrapper it
 * shells out to (chaos-master-gallery.sh) only ever execs THIS script, so
 * anything not routed through here is terminal-only.
 */
async function commandSequence(values) {
  const env = resolveEnv(values)
  if (values.slug === undefined) {
    throw new AdminError('usage', 'sequence needs --slug')
  }
  const slug = values.slug
  if (!SLUG_PATTERN.test(slug)) {
    throw new AdminError('bad-slug', `"${slug}" is not a valid slug`)
  }
  // Fail before doing any work if the row is not there — the sibling script
  // would report it too, but the console reads THIS error.
  const row = requireRow(env, slug)
  if (
    values.preview !== true &&
    TARGETS[env].storage === 'remote' &&
    row.published === 1
  ) {
    throw new AdminError(
      'published-sequence-mutation',
      `Refusing to mutate the sequence for published row "${slug}" in ${targetLabel(env)}`,
      {
        ...targetFields(env),
        slug,
        hint: `unpublish it first with: node scripts/gallery-admin.mjs publish --env ${env} --slug ${slug} --published 0${env === 'prod' ? ' --confirm prod' : ''}`,
      },
    )
  }

  const args = [join(scriptDir, 'gallery-sequence.mjs'), slug, '--apply', env]
  if (env === 'prod') args.push('--confirm', 'prod')
  const appendFiles = values.file ?? []
  if (values.clear === true) {
    args.push('--clear')
  } else if (appendFiles.length > 0) {
    // One at a time: each append reads the sequence, adds one flame and writes
    // it back, so handing the script two files at once would silently keep only
    // the last. `--file` is `multiple: true` for `put`'s sake, so guard it here.
    if (appendFiles.length > 1) {
      throw new AdminError(
        'usage',
        'sequence --file appends ONE flame; run it once per file',
      )
    }
    args.push('--append', resolve(process.cwd(), appendFiles[0]))
  } else {
    if (values.mode !== undefined) args.push('--mode', values.mode)
    if (values.derived !== undefined) args.push('--derived', values.derived)
    if (values.seed !== undefined) args.push('--seed', values.seed)
    if (values.paths !== undefined) args.push('--paths', values.paths)
    if (values.pick !== undefined) args.push('--pick', values.pick)
  }

  /*
   * A preview renders the candidates and returns them as images, writing
   * nothing. It needs a dev server for the same reason `capture` does — the
   * flames render on a real GPU through the app's own page — so it borrows the
   * same bootstrap, including auto-start.
   *
   * `--apply` is stripped: this must not be able to touch the database even if
   * the script it calls were to change under it.
   */
  if (values.preview === true) {
    // --apply becomes --read: same row, same parent flame, no write path at
    // all. Leaving --apply in place would work today only because the preview
    // returns before the UPDATE, which is one refactor away from writing.
    args[args.indexOf('--apply')] = '--read'
    args.push('--preview')

    const base = (values.base ?? DEFAULT_DEV_BASE).replace(/\/$/, '')
    const server = await ensureDevServer({
      base,
      autoStart: values['no-serve'] !== true,
      timeoutMs: 120_000,
    })
    args.push('--base', server.base)
    try {
      // Piped, not inherited: the payload is JSON for the console to render,
      // and progress chatter goes to stderr where it cannot corrupt it.
      const stdout = execFileSync('node', args, {
        cwd: appDir,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'inherit'],
      })
      // Returned, not emitted: the dispatcher wraps and prints it, so emitting
      // here would put two JSON objects on stdout and break every parser.
      return {
        preview: true,
        env,
        slug,
        title: row.title,
        ...JSON.parse(stdout),
      }
    } catch (error) {
      throw new AdminError(
        'preview-failed',
        `could not preview a sequence for "${slug}"`,
        {
          cause: error instanceof Error ? error.message : String(error),
          hint:
            'the derivation itself is cheap; a failure here is usually the ' +
            'dev server or the GPU. Re-run without --preview to see the ' +
            'derivation on its own.',
        },
      )
    } finally {
      await server.stop()
    }
  }

  note(
    `${
      values.clear === true
        ? 'Clearing'
        : appendFiles.length > 0
          ? 'Appending to'
          : 'Deriving'
    } the sequence for ${slug} in ${targetLabel(env)} ...`,
  )
  try {
    execFileSync('node', args, {
      cwd: appDir,
      stdio: ['ignore', 'inherit', 'inherit'],
    })
  } catch {
    throw new AdminError(
      'sequence-failed',
      `gallery-sequence.mjs failed for "${slug}"`,
      // The hint has to match what was actually attempted: suggesting another
      // seed to someone whose FILE PATH was wrong sends them looking in the
      // wrong place entirely.
      appendFiles.length > 0
        ? 'Its output is above. Check the --file path exists and is a flame ' +
            'PNG/JSON exported by the app.'
        : 'Its output is above. A different --seed usually fixes an unwanted path.',
    )
  }

  const after = requireRow(env, slug)
  return {
    ...targetFields(env),
    slug,
    cleared: values.clear === true,
    appended: appendFiles.length > 0 ? basename(appendFiles[0]) : null,
    mode:
      values.clear === true || appendFiles.length > 0
        ? null
        : (values.mode ?? 'steer'),
    hasSequence: after.has_sequence === 1,
    row: after,
    warnings:
      row.published === 1
        ? [
            `${slug} is published — the change is live as soon as it is ` +
              'written, unlike put, which stages',
          ]
        : [],
    next:
      after.has_sequence === 1
        ? [`node scripts/gallery-admin.mjs list --env ${env}`]
        : [],
  }
}

// ── CLI ──────────────────────────────────────────────────────────────

const OPTIONS = {
  env: { type: 'string' },
  confirm: { type: 'string' },
  file: { type: 'string', multiple: true },
  slug: { type: 'string' },
  section: { type: 'string' },
  title: { type: 'string' },
  caption: { type: 'string' },
  author: { type: 'string' },
  collection: { type: 'string' },
  provenance: { type: 'string' },
  'source-url': { type: 'string' },
  license: { type: 'string' },
  'license-url': { type: 'string' },
  attribution: { type: 'string' },
  changes: { type: 'string' },
  'original-id': { type: 'string' },
  capability: { type: 'string' },
  published: { type: 'string' },
  order: { type: 'string' },
  key: { type: 'string' },
  value: { type: 'string' },
  'all-missing': { type: 'boolean' },
  out: { type: 'string' },
  base: { type: 'string' },
  timeout: { type: 'string' },
  'no-serve': { type: 'boolean' },
  mode: { type: 'string' },
  derived: { type: 'string' },
  seed: { type: 'string' },
  paths: { type: 'string' },
  clear: { type: 'boolean' },
  preview: { type: 'boolean' },
  pick: { type: 'string' },
  yes: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
}

const COMMANDS = {
  list: { run: commandList, options: ['env', 'confirm'] },
  audit: { run: commandAudit, options: ['env', 'confirm'] },
  inspect: { run: commandInspect, options: ['file'] },
  put: {
    run: commandPut,
    options: [
      'env',
      'confirm',
      'file',
      'slug',
      'section',
      'title',
      'caption',
      'author',
      'collection',
      'provenance',
      'source-url',
      'license',
      'license-url',
      'attribution',
      'changes',
      'original-id',
      'capability',
    ],
  },
  capture: {
    run: commandCapture,
    options: [
      'env',
      'confirm',
      'slug',
      'all-missing',
      'out',
      'base',
      'timeout',
      'no-serve',
    ],
  },
  publish: {
    run: commandPublish,
    options: ['env', 'confirm', 'slug', 'published'],
  },
  delete: {
    run: commandDelete,
    options: ['env', 'confirm', 'slug', 'yes'],
  },
  poster: {
    run: commandPoster,
    options: ['env', 'confirm', 'slug'],
  },
  reorder: {
    run: commandReorder,
    options: ['env', 'confirm', 'slug', 'order'],
  },
  sequence: {
    run: commandSequence,
    options: [
      'env',
      'confirm',
      'slug',
      'mode',
      'derived',
      'seed',
      'paths',
      'clear',
      'file',
      // Look-before-you-write: --preview renders the candidates and returns
      // them as images without touching the row; --pick then commits the ones
      // that were worth keeping. --base/--no-serve are the dev server the
      // rendering needs, same as `capture`.
      'preview',
      'pick',
      'base',
      'no-serve',
    ],
  },
  config: {
    run: commandConfig,
    options: ['env', 'confirm', 'key', 'value'],
    // The only subcommand with a positional: `config get` / `config set` reads
    // the way every other config CLI spells it, and `--action get` would not.
    positionals: 1,
  },
}

/** Named as soon as it is known, so a failure can say which command failed. */
let activeCommand = null

async function main() {
  let parsed
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      options: OPTIONS,
    })
  } catch (error) {
    throw new AdminError('usage', error.message)
  }

  const [command, ...extra] = parsed.positionals
  if (command === undefined) {
    if (parsed.values.help === true) {
      console.log(HELP[''])
      return null
    }
    note(HELP[''])
    throw new AdminError('usage', 'Expected a subcommand', {
      commands: Object.keys(COMMANDS),
    })
  }
  if (!(command in COMMANDS)) {
    note(HELP[''])
    throw new AdminError('usage', `Unknown command "${command}"`, {
      commands: Object.keys(COMMANDS),
    })
  }
  activeCommand = command
  const spec = COMMANDS[command]
  if (parsed.values.help === true) {
    console.log(HELP[command])
    return null
  }

  // Every input is a named option, with one exception: `config get` / `config
  // set` takes its action as a positional (see COMMANDS.config).
  if (extra.length > (spec.positionals ?? 0)) {
    throw new AdminError(
      'usage',
      `Unexpected argument "${extra[spec.positionals ?? 0]}" — every input is a named option`,
    )
  }

  // Silently ignoring an option that does not apply is how a caller ends up
  // believing it did something. Name it instead.
  const given = Object.keys(parsed.values).filter((key) => key !== 'help')
  const unsupported = given.filter((key) => !spec.options.includes(key))
  if (unsupported.length > 0) {
    throw new AdminError(
      'usage',
      `${command} does not take ${unsupported.map((key) => `--${key}`).join(', ')}`,
      { accepts: spec.options.map((key) => `--${key}`) },
    )
  }

  const result = await spec.run(parsed.values, extra)
  return { ok: true, command, ...result }
}

/*
 * Only run the CLI when this file IS the command being run. Without the guard,
 * importing it for `describeSource` would execute main() against the importer's
 * argv and fail on an unknown subcommand.
 */
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = await main()
    if (result !== null) {
      emit(result)
      if (result.ok === false) process.exitCode = 1
    }
  } catch (error) {
    const known = error instanceof AdminError
    emit({
      ok: false,
      command: activeCommand,
      error: {
        code: known ? error.code : 'unexpected',
        message: error.message,
        ...(known && error.detail !== null ? { detail: error.detail } : {}),
        ...(known ? {} : { stack: error.stack }),
      },
    })
    note(`FAILED: ${error.message}`)
    process.exitCode = 1
  }
}
