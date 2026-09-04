import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { allTools } from './index'

/**
 * The catalogue in `docs/webmcp.md` is what a reader trusts to know what the
 * agent can do, and a stale count there is the tell that a tool was added
 * without being documented. This is the cheapest way to keep the two honest.
 */
// From the vitest root (`packages/app`), not from this module's URL: the
// transform pipeline rewrites `import.meta.url` to a non-file scheme.
const docs = readFileSync(join(process.cwd(), '../../docs/webmcp.md'), 'utf8')

describe('the tool catalogue in docs/webmcp.md', () => {
  it('states the number of tools that are actually registered', () => {
    const claimed = /(\d+) tools are registered/.exec(docs)?.[1]
    expect(claimed).toBeDefined()
    expect(Number(claimed)).toBe(allTools.length)
  })

  it('describes every tool except the one that only refuses', () => {
    // The table only — `arcade_end_duel` IS named further down, in the prose
    // that explains why it exists, and matching against the whole document
    // would let a tool that is merely mentioned pass as documented.
    const from = docs.indexOf('| Tool')
    const table = docs.slice(from, docs.indexOf('\n\n', from))
    const undocumented = allTools
      .map((tool) => tool.name)
      .filter((name) => !table.includes(`\`${name}\``))
    // `arcade_end_duel` is registered so a chat already in flight has
    // something to call and be corrected by; it is explained in prose under
    // Duel rather than offered in the table as a capability.
    expect(undocumented).toEqual(['arcade_end_duel'])
  })
})
