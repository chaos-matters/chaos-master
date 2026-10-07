// Holds MainWorkspace.tsx to a line count that may only go down (refactor
// WP3, guard G2).
//
// The file grew by 458 lines during the mobile wave while a written goal said
// it should shrink, and nothing noticed: `largest_file_loc` in the metrics
// ratchet is a 5,713-line data file, and `files_over_1200` cannot tell 4,000
// lines from 4,500. So the count is pinned here, where it runs on every pull
// request, and pinned exactly:
//
// - more lines than MAX_LINES fails: move the new code into a hook or a
//   component instead;
// - fewer lines than MAX_LINES fails too, until MAX_LINES is lowered to the
//   new count in the same pull request. A ratchet that is not tightened when
//   the file shrinks lets it grow back into the slack unnoticed.
//
// MAX_LINES is not written here. Since WP3b (2026-09-24) it is the
// MainWorkspace entry of docs/agent/code-metrics.file-caps.json, the per-file
// cap `pnpm metrics:check` also holds, so the file has one pin: a change that
// shrinks it lowers one number (`pnpm metrics:caps` does). This test is the
// half that runs on every pull request's scoped suite, with the message about
// hooks.
//
// Raising the cap is always a visible one-line diff, and a reviewer should
// ask why. The goal is about 1,500 lines (REFACTOR-MASTER-PLAN.md, WP5).
//
// Lines are counted as the metrics script counts them (scripts/code-metrics.mjs):
// the file split on '\n', so a trailing newline counts as one more line than
// `wc -l` reports.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CAPS_FILE = 'docs/agent/code-metrics.file-caps.json'
const CAP_KEY = 'packages/app/src/MainWorkspace.tsx'

const caps: unknown = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../..', CAPS_FILE), 'utf8'),
)
/** The line count of MainWorkspace.tsx, from its per-file cap. Only lower it. */
const MAX_LINES =
  typeof caps === 'object' && caps !== null && Object.hasOwn(caps, CAP_KEY)
    ? (caps as Record<string, unknown>)[CAP_KEY]
    : undefined

const lines = readFileSync(
  join(import.meta.dirname, 'MainWorkspace.tsx'),
  'utf8',
).split('\n').length

describe('MainWorkspace.tsx line ratchet', () => {
  it('reads its ratchet from the per-file caps', () => {
    // Without the entry the two checks below would compare against nothing.
    // Put it back rather than pinning a number here again.
    expect(
      Number.isInteger(MAX_LINES),
      `${CAPS_FILE} has no integer entry for ${CAP_KEY}; G2 reads its ` +
        'ratchet from there.',
    ).toBe(true)
  })

  it('has not grown past its ratchet', () => {
    expect(
      lines,
      `MainWorkspace.tsx has ${lines} lines, over its ratchet of ${MAX_LINES}. ` +
        'Put the new code in a hook (hooks/useWorkspace*) or a component, ' +
        'not in MainWorkspace.',
    ).toBeLessThanOrEqual(Number(MAX_LINES))
  })

  it('has its ratchet lowered when it shrinks', () => {
    expect(
      lines,
      `MainWorkspace.tsx shrank to ${lines} lines. Lower its cap in ` +
        `${CAPS_FILE} from ${MAX_LINES} to ${lines} in this change ` +
        '(`pnpm metrics:caps` does), so the file cannot grow back into the ' +
        'slack.',
    ).toBeGreaterThanOrEqual(Number(MAX_LINES))
  })
})
