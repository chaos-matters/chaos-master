// Per-file line caps for the largest source files: the shrink-only ratchet
// behind `pnpm metrics:check` (scripts/code-metrics.mjs) and `pnpm metrics:caps`.
//
// The bucket counts (files_over_800, files_over_1200) only notice a file that
// CROSSES an edge. Growth inside a file already over the edge was invisible:
// BenchmarksPage.tsx took 1,200 more lines and the ratchet stayed green. And a
// file sitting exactly on an edge could only grow by shaving comments to stay
// on it (recorder.ts at 1,200, timeline.ts and ifsPipeline.ts at 800 on
// 2026-09-23). So every file with CAP_FLOOR lines or more carries a cap in
// docs/agent/code-metrics.file-caps.json, equal to its size, and:
//
// - growth past a cap fails;
// - shrinking below a cap also fails, until the cap is lowered in the same
//   change, so the file cannot grow back into the slack. `pnpm metrics:caps`
//   lowers every cap that can go down and changes nothing else.
//   mainWorkspaceSize.test.ts (G2) reads MainWorkspace.tsx's cap from here and
//   asks the same on every pull request;
// - a file at or over CAP_FLOOR with no cap fails: a rename moves its cap to
//   the new path, a new file that big is split or capped by hand;
// - a cap for a file that is gone, or has fallen under CAP_FLOOR, fails until
//   it is removed; the files_over_* buckets hold that file from there.
//
// A cap is only ever RAISED, or ADDED for a new file, by hand, with the reason
// in the commit message. No command here raises one.
//
// Pure functions only, so scripts/file-caps.test.mjs can test them without a
// tree. Paths are repo-relative with forward slashes; line counts are
// `text.split('\n').length`, the count code-metrics.mjs uses everywhere.

/** A file with at least this many lines carries a cap. */
export const CAP_FLOOR = 800

/** The bucket edges code-metrics.mjs counts files over. */
export const BUCKET_EDGES = [500, 800, 1200]

/**
 * Compare today's line counts with the caps.
 *
 * @param {Map<string, number>} counts every source file and its line count
 * @param {Record<string, number>} caps the committed caps
 * @returns {{
 *   grew: { file: string, lines: number, cap: number }[],
 *   shrank: { file: string, lines: number, cap: number }[],
 *   uncapped: { file: string, lines: number }[],
 *   stale: { file: string, lines: number | null, cap: number }[],
 * }}
 */
export function checkFileCaps(counts, caps) {
  const grew = []
  const shrank = []
  const uncapped = []
  const stale = []
  for (const [file, cap] of Object.entries(caps)) {
    const lines = counts.get(file)
    if (lines === undefined || lines < CAP_FLOOR) {
      stale.push({ file, lines: lines ?? null, cap })
    } else if (lines > cap) {
      grew.push({ file, lines, cap })
    } else if (lines < cap) {
      shrank.push({ file, lines, cap })
    }
  }
  for (const [file, lines] of counts) {
    if (lines >= CAP_FLOOR && !Object.hasOwn(caps, file)) {
      uncapped.push({ file, lines })
    }
  }
  const byFile = (a, b) => a.file.localeCompare(b.file)
  return {
    grew: grew.sort(byFile),
    shrank: shrank.sort(byFile),
    uncapped: uncapped.sort(byFile),
    stale: stale.sort(byFile),
  }
}

/** Every finding as the line the check prints. Empty when the caps hold. */
export function capFailures(result) {
  const out = []
  for (const r of result.grew) {
    out.push(
      `${r.file}: ${r.lines} lines, over its cap of ${r.cap}. Put the new ` +
        'code in a module of its own, not in a file this size. A cap is ' +
        'raised only by hand, with the reason in the commit message.',
    )
  }
  for (const r of result.shrank) {
    out.push(
      `${r.file} shrank to ${r.lines} lines. Lower its cap from ${r.cap} to ` +
        `${r.lines} in this change, so it cannot grow back into the slack ` +
        '(`pnpm metrics:caps` lowers every cap that can go down).',
    )
  }
  for (const r of result.uncapped) {
    out.push(
      `${r.file}: ${r.lines} lines and no cap. Renamed: move its cap to this ` +
        `path. New: split it; a new file of ${CAP_FLOOR} lines or more is ` +
        'capped by hand, with the reason in the commit message.',
    )
  }
  for (const r of result.stale) {
    const now =
      r.lines === null ? 'is gone' : `has ${r.lines} lines, under ${CAP_FLOOR}`
    out.push(
      `${r.file} has a cap of ${r.cap} but ${now}. Remove its cap ` +
        '(`pnpm metrics:caps` does).',
    )
  }
  return out
}

/**
 * The caps with every one that can go down lowered to its file's size, and
 * every stale one removed. Never raises a cap and never adds one: a file that
 * grew keeps its cap, and a file without one stays without, so the check
 * still fails on both.
 */
export function lowerCaps(counts, caps) {
  const out = {}
  for (const file of Object.keys(caps).sort()) {
    const cap = caps[file]
    const lines = counts.get(file)
    if (lines === undefined || lines < CAP_FLOOR) continue
    out[file] = Math.min(cap, lines)
  }
  return out
}

/** Files sitting exactly on a bucket edge, the place shaving parks them. */
export function atBucketEdge(counts, edges = BUCKET_EDGES) {
  return [...counts]
    .filter(([, lines]) => edges.includes(lines))
    .map(([file, lines]) => ({ file, lines }))
    .sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file))
}

/** The caps file's text: one entry per line, sorted by path, so two changes
 *  that lower different caps never touch the same line. */
export function formatCaps(caps) {
  const sorted = Object.fromEntries(
    Object.keys(caps)
      .sort()
      .map((k) => [k, caps[k]]),
  )
  return `${JSON.stringify(sorted, null, 2)}\n`
}
