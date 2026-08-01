// Where gallery content lives — for every script that touches it.
//
// One module on purpose. Four scripts read and write the same rows and the
// same posters, and the one thing they must never disagree about is which
// storage a target name means: a script that thinks `local` is remote writes
// straight into the deployed dev database. Keeping the map, the wrangler flags
// and the human label here makes that disagreement impossible to introduce.

/**
 * `local` is NOT a third database. It is the same dev database and the same
 * dev bucket, addressed through wrangler's local (miniflare) storage under
 * `packages/app/.wrangler` instead of over the network. Nothing a local run
 * writes is visible to anyone else, and `wrangler dev --env dev` serves back
 * exactly what was just written — which is why it is the default.
 */
export const TARGETS = {
  local: {
    storage: 'local',
    database: 'chaos-master-content-dev',
    bucket: 'chaos-master-og-images-dev',
    // miniflare resolves a store from the BINDING in wrangler.jsonc, not from
    // the name on the command line, and the top-level config declares none.
    // Without --env there is no local database to find.
    wranglerEnv: 'dev',
  },
  dev: {
    storage: 'remote',
    database: 'chaos-master-content-dev',
    bucket: 'chaos-master-og-images-dev',
  },
  prod: {
    storage: 'remote',
    database: 'chaos-master-content',
    bucket: 'chaos-master-og-images',
  },
}

/** `local | dev | prod`, for help text and error messages. */
export const TARGET_LIST = Object.keys(TARGETS).join(' | ')

/**
 * The flags that decide WHERE a wrangler d1/r2 command reads and writes.
 *
 * Remote targets keep the exact argument shape they had before `local`
 * existed — addressed by name, no --env — so nothing about dev or prod
 * changed when local was added.
 */
export function storageFlags(env) {
  const target = TARGETS[env]
  return target.storage === 'local'
    ? ['--local', '--env', target.wranglerEnv]
    : ['--remote']
}

/**
 * What a human sees. It always carries the storage, because local and dev
 * share a database NAME: the name alone cannot tell one run from the other.
 */
export function targetLabel(env) {
  const target = TARGETS[env]
  return `${target.database} (${target.storage})`
}

/** Where the schema lives, relative to packages/app. */
export const MIGRATIONS_DIR = 'migrations'

/**
 * The wrangler invocation that brings a target's schema up to date — every
 * migration in `MIGRATIONS_DIR`, in filename order.
 *
 * `d1 migrations apply` rather than `d1 execute --file=<the one schema file>`,
 * which is what this was while there was only one migration. The schema is
 * applied automatically and repeatedly to local stores (gallery-admin
 * initialises on a missing table, seed-gallery before every local seed), so
 * every migration has to be safe to re-run — and `ALTER TABLE ... ADD COLUMN`
 * cannot be, SQLite having no `IF NOT EXISTS` for it. Wrangler records what it
 * has applied in `d1_migrations` and skips those, which makes re-running a
 * no-op no matter what a migration contains. A store created before that table
 * existed picks up from `0001`, whose `CREATE ... IF NOT EXISTS` statements are
 * satisfied already.
 */
export function migrationsArgs(env) {
  return [
    'exec',
    'wrangler',
    'd1',
    'migrations',
    'apply',
    TARGETS[env].database,
    ...storageFlags(env),
  ]
}

// With --json, wrangler reports a failed statement as JSON on STDOUT rather
// than stderr — both locally and through the API — so callers must test both
// streams. The word boundary keeps a query against some other missing table
// from looking like an uninitialised gallery.
const MISSING_TABLE = /no such table:\s*(?:main\.)?gallery_items\b/i

/** Did this wrangler failure mean "the gallery table does not exist"? */
export const isMissingTable = (output) => MISSING_TABLE.test(output)

/** The exact command that applies them, so an error can be acted on. */
export function initCommand(env) {
  return `pnpm ${migrationsArgs(env).join(' ')}`
}

/** The last few meaningful lines of a captured stream, for error details. */
export function tail(text, lines = 12) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(-lines)
}
