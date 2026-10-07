import '@/commands/builtins'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { parseFlameXml } from '@/flame/flameXml'
import { extractFlameFromPng } from '@/utils/flameInPng'
import { reportPlan } from './report'
import { SYNTHESIS_STRATEGIES } from './strategies'
import type { SynthesisStrategy } from './strategies'

/**
 * The planner against real flames.
 *
 * Two corpora, and the one that matters runs everywhere. Every flame committed
 * in this repo — the built-in examples, 2D and 3D, plus the `.flame` fixtures —
 * is planned backwards, replayed, and compared, on every run. It pins the
 * number this subsystem is judged by: how many of them the steps alone rebuild,
 * before the closing `flame.load` snap carries whatever is left. That is a set
 * rather than a ratio, and it is asserted by name, so a flame that starts
 * needing the snap is named and a flame that stops needing it is too.
 */

/** Flames committed as XML rather than as a module. */
const FIXTURE_XML = import.meta.glob('@/flame/__fixtures__/*.flame', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/**
 * The corpus, as `[name, descriptor]`. Names are what an assertion failure
 * prints, so they are the ones a person can look up: the example's export name,
 * or the fixture's filename.
 */
function committedFlames(): [string, unknown][] {
  const fixtures = Object.keys(FIXTURE_XML)
    .sort()
    .map(
      (path) =>
        [
          `fixture:${path.split('/').pop() ?? path}`,
          parseFlameXml(FIXTURE_XML[path]!),
        ] as [string, unknown],
    )
  return [...Object.entries(examples), ...fixtures]
}

/**
 * 71 flames were committed when the set below was measured. A floor, not an
 * equality: adding an example must not fail this test, but a glob that stops
 * finding the fixtures — or an examples barrel that stops exporting them —
 * would otherwise turn the whole corpus run into a silent no-op.
 */
const CORPUS_FLOOR = 71

/**
 * The flames the steps alone do not reach, by name, and the same two for every
 * strategy. Both are symmetry flames: only `flame.applySymmetry` can mint a
 * `_sym__…` transform and no command replays one, so the closing `flame.load`
 * carries them. Every other committed flame is rebuilt by the steps.
 */
const NEEDS_THE_SNAP = ['example26', 'example29']

describe('planCreation over the flames committed in this repo', () => {
  it('draws its corpus from both places flames are committed', () => {
    const names = committedFlames().map(([name]) => name)

    expect(names).toContain('example1')
    expect(names).toContain('fixture:many-xforms.flame')
    expect(names.length).toBeGreaterThanOrEqual(CORPUS_FLOOR)
  })

  it.each(SYNTHESIS_STRATEGIES)(
    'rebuilds them all with the %s strategy, and names the ones only the snap reaches',
    (strategy: SynthesisStrategy) => {
      const failures: string[] = []
      const snapped: string[] = []
      const residual: string[] = []

      for (const [name, flame] of committedFlames()) {
        const report = reportPlan(flame, { strategy, seed: 1 })
        if (report.snapped) {
          snapped.push(name)
          residual.push(...report.residual.map((path) => `${name}: ${path}`))
        }
        if (!report.ok) {
          failures.push(
            `${name}: ${report.error ?? report.mismatched.slice(0, 4).join(', ')}`,
          )
        }
      }

      // Every flame ends on itself. A name here is a reconstruction that
      // landed somewhere else, which the snap exists to make impossible.
      expect(failures).toEqual([])
      // And the steps alone got all but these.
      expect([...snapped].sort()).toEqual(NEEDS_THE_SNAP)
      // What they missed is symmetry, and only symmetry. A path here is a
      // second kind of gap, which belongs in the coverage table before it
      // belongs in this list.
      expect(residual.filter((entry) => !entry.includes('._sym__'))).toEqual([])
    },
    60_000,
  )
})

/**
 * The same judgement over a corpus that lives OUTSIDE the repo: hundreds of
 * PNGs in an artist's folders or a downloads directory, whose paths arrive in
 * `SYNTH_CORPUS` — one or more directories, separated by `:` or `,`, scanned
 * recursively:
 *
 *   SYNTH_CORPUS=~/Pictures/chaos npx vitest run src/recorder/synthesize
 *
 * Without it this half skips, because a test that hard-codes someone's home
 * directory fails for everyone else and proves nothing in CI. It is a
 * diagnostic, not a gate: it asserts only that every PNG carrying a flame
 * replays back to that exact flame, and reports how each one got there.
 */

const CORPUS_DIRS = (process.env.SYNTH_CORPUS ?? '')
  .split(/[:,]/)
  .map((entry) => entry.trim())
  .filter((entry) => entry !== '')

function pngsUnder(dir: string, out: string[] = []): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) pngsUnder(path, out)
    else if (entry.name.toLowerCase().endsWith('.png')) out.push(path)
  }
  return out
}

describe.skipIf(CORPUS_DIRS.length === 0)(
  'planCreation over a PNG corpus',
  () => {
    const files = CORPUS_DIRS.flatMap((dir) => pngsUnder(dir)).sort()

    it.each(SYNTHESIS_STRATEGIES)(
      'rebuilds every corpus flame with the %s strategy',
      async (strategy: SynthesisStrategy) => {
        const failures: string[] = []
        const stats = {
          flames: 0,
          exact: 0,
          snapped: 0,
          unreadable: 0,
          steps: [] as number[],
        }

        for (const file of files) {
          let payload
          try {
            payload = await extractFlameFromPng(
              new Uint8Array(readFileSync(file)),
            )
          } catch (error) {
            // No FlameJson chunk, or one this build cannot read. Counted
            // rather than ignored, so the summary's flame count is what the
            // run judged and not what it walked past.
            stats.unreadable++
            console.info(
              `[corpus:${strategy}] unreadable ${file}: ${String(error)}`,
            )
            continue
          }
          stats.flames++
          const report = reportPlan(payload, { strategy, seed: 1 })
          stats.steps.push(report.steps)
          if (report.snapped) {
            stats.snapped++
            console.info(
              `[corpus:${strategy}] snapped ${file} after ${report.steps} steps` +
                ` — residual: ${report.residual.slice(0, 6).join(', ')}`,
            )
          } else stats.exact++
          if (!report.ok) {
            failures.push(
              `${file}: ${report.error ?? report.mismatched.slice(0, 4).join(', ')}`,
            )
          }
        }

        const mean =
          stats.steps.length === 0
            ? 0
            : stats.steps.reduce((total, n) => total + n, 0) /
              stats.steps.length
        console.info(
          `[corpus:${strategy}] ${files.length} PNGs, ${stats.flames} flames ` +
            `(${stats.unreadable} without one) — ${stats.exact} exact, ` +
            `${stats.snapped} needed a snap; steps mean ${mean.toFixed(1)}, ` +
            `max ${Math.max(0, ...stats.steps)}`,
        )
        expect(failures).toEqual([])
        expect(stats.flames).toBeGreaterThan(0)
      },
      120_000,
    )
  },
)
