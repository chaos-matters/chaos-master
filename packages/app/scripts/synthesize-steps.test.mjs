// The two places `synthesize-steps` touches the filesystem on someone else's
// say-so: where a result is written, and the scratch directory the bundle goes
// into. Both are pure enough to test without bundling the planner, which is a
// twenty-second esbuild run per case.
import assert from 'node:assert/strict'
import { existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { isInside, outputPath, safeName, withBundleDir, } from './synthesize-steps.mjs'

const OUT = '/tmp/steps-out'

/** One planner result, as `runPlanner` hands it back. */
function result(input, strategy = 'perTransform') {
  return { input, strategy }
}

await describe('where a session is written', async () => {
  await it('keeps a manifest name that climbs out inside --out-dir', () => {
    const names = new Map([['/flames/a.png', '../../etc/cron.d/x']])
    const target = outputPath({ outDir: OUT }, result('/flames/a.png'), names)

    assert.equal(target, join(OUT, '_etc_cron_d_x.perTransform.steps.json'))
    assert.ok(isInside(OUT, target))
  })

  await it('keeps an absolute manifest name inside --out-dir', () => {
    const names = new Map([['/flames/a.png', '/etc/passwd']])
    const target = outputPath({ outDir: OUT }, result('/flames/a.png'), names)

    assert.equal(target, join(OUT, '_etc_passwd.perTransform.steps.json'))
    assert.ok(isInside(OUT, target))
  })

  await it('sanitises a manifest name exactly as it does a basename', () => {
    const supplied = outputPath(
      { outDir: OUT },
      result('/flames/a.png'),
      new Map([['/flames/a.png', 'Wild Fern!']]),
    )
    const fallback = outputPath(
      { outDir: OUT },
      result('/flames/Wild Fern!.png'),
      new Map(),
    )

    assert.equal(safeName('Wild Fern!'), 'Wild_Fern_')
    assert.equal(supplied, fallback)
  })

  await it('writes beside the input when no output directory is given', () => {
    const target = outputPath({}, result('/flames/a.png'), new Map())
    assert.equal(target, resolve('/flames/a.perTransform.steps.json'))
  })

  await it('takes an explicit --out as the caller meant it', () => {
    const out = '/somewhere/else/one.steps.json'
    assert.equal(outputPath({ out }, result('/flames/a.png'), new Map()), out)
  })

  await it('answers containment without being fooled by a prefix', () => {
    assert.ok(isInside('/tmp/out', '/tmp/out/a.json'))
    assert.ok(isInside('/tmp/out', '/tmp/out/nested/a.json'))
    assert.ok(!isInside('/tmp/out', '/tmp/outside/a.json'))
    assert.ok(!isInside('/tmp/out', '/tmp/a.json'))
    assert.ok(!isInside('/tmp/out', '/tmp/out'))
  })
})

await describe('the scratch directory the bundle goes into', async () => {
  await it('is gone after a run that succeeded', async () => {
    let seen
    const value = await withBundleDir((dir) => {
      seen = dir
      writeFileSync(join(dir, 'synthesize.mjs'), 'export default 1\n')
      assert.ok(existsSync(seen))
      return 'planned'
    })

    assert.equal(value, 'planned')
    assert.ok(!existsSync(seen))
  })

  await it('is gone after a run that threw, and the error still arrives', async () => {
    let seen
    await assert.rejects(
      withBundleDir((dir) => {
        seen = dir
        writeFileSync(join(dir, 'synthesize.mjs'), 'export default 1\n')
        throw new Error('the planner exploded')
      }),
      /the planner exploded/,
    )

    assert.ok(seen !== undefined)
    assert.ok(!existsSync(seen))
  })

  await it('leaves no signal handler behind', async () => {
    const before = process.listenerCount('SIGINT')
    await withBundleDir(() => undefined)
    assert.equal(process.listenerCount('SIGINT'), before)
  })

  await it('makes a fresh directory each time, under the OS temp root', async () => {
    const dirs = []
    await withBundleDir((dir) => dirs.push(dir))
    await withBundleDir((dir) => dirs.push(dir))

    assert.notEqual(dirs[0], dirs[1])
    // Not next to anybody's flames, and named so a stray one is identifiable.
    assert.ok(dirs[0].startsWith(join(tmpdir(), 'synthesize-steps-')))
  })
})
