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
// Raising MAX_LINES is always a visible one-line diff, and a reviewer should
// ask why. The goal is about 1,500 lines (REFACTOR-MASTER-PLAN.md, WP5).
//
// Lines are counted as the metrics script counts them (scripts/code-metrics.mjs):
// the file split on '\n', so a trailing newline counts as one more line than
// `wc -l` reports.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The line count of MainWorkspace.tsx today. Only ever lower it. */
const MAX_LINES = 4533

const lines = readFileSync(
  join(import.meta.dirname, 'MainWorkspace.tsx'),
  'utf8',
).split('\n').length

describe('MainWorkspace.tsx line ratchet', () => {
  it('has not grown past its ratchet', () => {
    expect(
      lines,
      `MainWorkspace.tsx has ${lines} lines, over its ratchet of ${MAX_LINES}. ` +
        'Put the new code in a hook (hooks/useWorkspace*) or a component, ' +
        'not in MainWorkspace.',
    ).toBeLessThanOrEqual(MAX_LINES)
  })

  it('has its ratchet lowered when it shrinks', () => {
    expect(
      lines,
      `MainWorkspace.tsx shrank to ${lines} lines. Lower MAX_LINES in ` +
        `mainWorkspaceSize.test.ts from ${MAX_LINES} to ${lines} in this ` +
        'change, so the file cannot grow back into the slack.',
    ).toBeGreaterThanOrEqual(MAX_LINES)
  })
})
