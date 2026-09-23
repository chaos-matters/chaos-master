/**
 * Every command the app dispatches by name is one the registry has.
 *
 * `executeCommand` with an id nobody registered is a silent no-op outside a
 * dev build (registry.ts), so a control wired to a misspelt or never-written
 * command looks fine in review and does nothing when pressed. The tablet
 * deck's save button fell back to `flame.quickExport`, a command that never
 * existed. This walks the source for ids written out as string literals and
 * asks the real registry about each of them.
 */
import '@/commands/builtins'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getAllCommands } from './registry'

const SRC = join(import.meta.dirname, '..')

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, acc)
    else if (/\.tsx?$/.test(name) && !/\.(test|spec|d)\.tsx?$/.test(name))
      acc.push(full)
  }
  return acc
}

/** `executeCommand('a.b'`, `executeReplayCommand('a.b'` and the components'
 *  own `dispatch('a.b'` wrappers around them. */
const DISPATCH =
  /\b(?:executeCommand|executeReplayCommand|dispatch)\(\s*'([a-z][\w]*\.[\w.]+)'/g

describe('commands dispatched by name', () => {
  it('are all registered', () => {
    const registered = new Set(getAllCommands().map((cmd) => cmd.id))
    const unregistered: string[] = []
    let seen = 0
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(DISPATCH)) {
        seen++
        const id = match[1]!
        if (!registered.has(id)) {
          unregistered.push(`${relative(SRC, file)}: ${id}`)
        }
      }
    }
    // The walk found the dispatches at all: a pattern that matched nothing
    // would pass this test forever.
    expect(seen).toBeGreaterThan(100)
    expect(unregistered).toEqual([])
  })
})
