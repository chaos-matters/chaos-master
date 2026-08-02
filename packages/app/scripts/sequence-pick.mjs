// Which previewed candidates get written.
//
// Its own module, with no imports, for one reason: it is the only part of the
// sequence tooling worth unit-testing, and gallery-sequence.mjs cannot be
// imported from a test — it pulls in gallery-admin.mjs, which resolves repo
// paths at module load.

/**
 * Parse `--pick 0,3,4` into indices that actually exist.
 *
 * Refuses an out-of-range index rather than silently dropping it: a curator who
 * mistypes one should be told, not handed a shorter walk than they asked for
 * and left to notice later.
 *
 * Order is preserved and repeats are kept — `--pick 2,0,2` is a deliberate
 * three-step walk that revisits a flame, not a mistake to be tidied up.
 *
 * THROWS rather than exiting, so the parsing can be tested without taking the
 * test runner down with it; the CLI turns the error into a `fail()`.
 *
 * @param {string} raw    the flag's value
 * @param {number} count  how many candidates the derivation produced
 * @returns {number[]}
 */
export function parsePick(raw, count) {
  // argv always hands this over as a string.
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  if (parts.length === 0) throw new Error('--pick needs at least one index')
  const picked = []
  for (const part of parts) {
    const n = Number(part)
    if (!Number.isInteger(n) || n < 0 || n >= count) {
      const error = new Error(`--pick index "${part}" is out of range`)
      error.hint = `this derivation produced ${count} candidate(s): 0..${count - 1}`
      throw error
    }
    picked.push(n)
  }
  return picked
}
