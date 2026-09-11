// Guards against Solid computations created at module scope.
//
// A createMemo or createEffect evaluated at import time has no owner. Solid's
// dev build warns that it "will never be disposed"; the production build says
// nothing at all, so no e2e run against a production bundle -- which is what
// the smoke suite serves -- can ever see it. Three of these shipped on every
// route from workspaceLayoutStore before this test existed.
//
// The check is static and deliberately simple: prettier-formatted code only
// starts a line at column 0 with a declaration at module scope, so a
// computation call there is a module-scope computation. Wrap a genuinely
// process-lifetime one in createRoot, as workspaceLayoutStore does.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = import.meta.dirname
const COMPUTATION =
  /^(?:export\s+)?(?:(?:const|let|var)\s+[\w$[\]{},\s]+=\s*)?create(?:Memo|Effect|RenderEffect|Computed|Selector|Deferred|Resource|Reaction)\s*[(<]/

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

describe('module-scope Solid computations', () => {
  it('creates no computation outside an owner at import time', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          COMPUTATION.test(line)
            ? [`${relative(SRC, file)}:${i + 1}: ${line.trim()}`]
            : [],
        ),
    )
    expect(offenders).toEqual([])
  })
})
