import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The touch surfaces read the --la-* tokens; a hex literal here is a colour
// that will not follow the direction switch (docs/plans/mobile-native/DESIGN.md).
describe('touch surface stylesheets', () => {
  it('carry no hex colour literals', () => {
    const dir = __dirname
    const offenders: string[] = []
    for (const file of readdirSync(dir).filter((f) =>
      f.endsWith('.module.css'),
    )) {
      const css = readFileSync(join(dir, file), 'utf8')
      for (const match of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g))
        offenders.push(`${file}: ${match[0]}`)
    }
    expect(offenders).toEqual([])
  })
})
