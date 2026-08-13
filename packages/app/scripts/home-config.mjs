// What `home_config` is allowed to contain — for every script that writes it.
//
// The table is key/value with no CHECK constraint (see
// migrations/0003_home_config.sql), so this list IS the schema: a typo'd key
// would otherwise be written happily, read by nobody, and look exactly like a
// setting that does not work.
//
// Mirrored by `HOME_CONFIG_KEYS` in src/lib/homeConfig.ts, which is the app
// side of the same contract. homeConfig.test.ts asserts the two agree, so a key
// added to one and forgotten in the other fails the suite instead of shipping
// a setting nothing can read (or nothing can write).

/** Every key `config set` will accept, with what it means and what it takes. */
export const CONFIG_KEYS = {
  portal_tour_id: {
    describe: 'id of the tour Home\'s "Made here" portal replays',
    // Tour ids are code (src/tours/registry.ts), so this cannot validate the
    // VALUE against a list — the script has no way to import TypeScript. The
    // client falls back to `example1-creation` for an id it does not have, so
    // a wrong id degrades to the default rather than breaking Home; the shape
    // check below is only there to catch whitespace and pasted junk.
    pattern: /^[a-z0-9][a-z0-9-]{0,63}$/,
    hint: 'lowercase letters, digits and hyphens, e.g. example1-creation',
  },
}

/** `key | key | ...`, for help text and error messages. */
export const CONFIG_KEY_LIST = Object.keys(CONFIG_KEYS).join(' | ')

/**
 * Check a key/value pair against the allowlist.
 *
 * Returns `null` when it is acceptable, or `{ code, message, detail }` — the
 * shape gallery-admin turns into an AdminError, kept data rather than a throw
 * so this module stays free of the script's error class.
 */
export function checkConfigEntry(key, value) {
  const spec = CONFIG_KEYS[key]
  if (spec === undefined) {
    return {
      code: 'unknown-config-key',
      message: `"${key}" is not a home_config key this build knows`,
      detail: {
        key,
        known: Object.keys(CONFIG_KEYS),
        hint: 'the allowlist lives in scripts/home-config.mjs and src/lib/homeConfig.ts',
      },
    }
  }
  if (value === undefined) {
    return null
  }
  if (!spec.pattern.test(value)) {
    return {
      code: 'invalid-config-value',
      message: `"${value}" is not a valid ${key}`,
      detail: { key, value, pattern: spec.pattern.source, hint: spec.hint },
    }
  }
  return null
}
