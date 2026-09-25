/**
 * The IFS compute shaders, pinned byte for byte.
 *
 * Every shipped example is resolved to WGSL through the pipeline its dimension
 * selects, and every 2D example also through the 3D pipeline, which is how a
 * 2D flame reaches 3D through an import, an agent or breeding. The golden
 * record holds a SHA-256 of each shader, and the full text of two of them so a
 * change can be read in a diff.
 *
 * It guards the promise the clash team kernel makes: a flame that does not tag
 * its transforms with two teams compiles to exactly the shader it compiled to
 * before the kernel existed. It equally catches any other change to a shader,
 * so a legitimate one (a new variation body, a pipeline fix) regenerates the
 * record on purpose:
 *
 *   UPDATE_WGSL_GOLDEN=1 npx vitest run --root packages/app \
 *     src/flame/ifsPipeline.wgslGolden.test.ts
 *
 * and the diff names every flame it touched. Never regenerate to make a red
 * test green without reading which shaders moved and why.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RENDERER_RANDOM_IMPLEMENTATION_IDS } from '@/shaders/random'
import { examples } from './examples'
import { resolveIfsWgsl } from './ifsPipelineWgsl.testUtils'
import type { IfsShaderShape } from './ifsPipelineWgsl.testUtils'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const GOLDEN = join(FIXTURES, 'ifsPipeline.wgsl.golden.json')
const FULL_TEXT = {
  'example2.2d': join(FIXTURES, 'wgsl', 'example2.2d.wgsl'),
  'example37.3d': join(FIXTURES, 'wgsl', 'example37.3d.wgsl'),
} as const
const UPDATING = process.env.UPDATE_WGSL_GOLDEN === '1'

/** Every shader the record pins, by a stable case name. */
function cases(): [string, IfsShaderShape][] {
  const out: [string, IfsShaderShape][] = []
  for (const [name, flame] of Object.entries(examples)) {
    const dims = flame.renderSettings.dimensions === 3 ? 3 : 2
    out.push([`${name}.${dims}d`, { transforms: flame.transforms, dims }])
    if (dims === 2) {
      out.push([`${name}.2d-in-3d`, { transforms: flame.transforms, dims: 3 }])
    }
  }
  out.push([
    'example2+example1.blend',
    {
      transforms: examples.example2.transforms,
      blendTransforms: examples.example1.transforms,
      dims: 2,
    },
  ])
  out.push([
    'example2.2d.legacy-rng',
    {
      transforms: examples.example2.transforms,
      dims: 2,
      random: RENDERER_RANDOM_IMPLEMENTATION_IDS.legacy,
    },
  ])
  out.push([
    'example37.3d.legacy-rng',
    {
      transforms: examples.example37.transforms,
      dims: 3,
      random: RENDERER_RANDOM_IMPLEMENTATION_IDS.legacy,
    },
  ])
  return out
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

describe('IFS compute shaders (golden)', () => {
  const resolved = cases().map(([name, shape]) => ({
    name,
    wgsl: resolveIfsWgsl(shape),
  }))
  const digests = Object.fromEntries(
    resolved.map(({ name, wgsl }) => [name, sha256(wgsl)]),
  )

  if (UPDATING) {
    it('regenerates the record', () => {
      writeFileSync(GOLDEN, `${JSON.stringify(digests, null, 2)}\n`)
      mkdirSync(join(FIXTURES, 'wgsl'), { recursive: true })
      for (const [name, path] of Object.entries(FULL_TEXT)) {
        const wgsl = resolved.find((r) => r.name === name)?.wgsl
        if (wgsl === undefined) throw new Error(`no case ${name}`)
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- a FULL_TEXT fixture path, in this repo
        writeFileSync(path, wgsl)
      }
    })
    return
  }

  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<
    string,
    string
  >

  it('pins the same set of shaders', () => {
    expect(Object.keys(digests).sort()).toEqual(Object.keys(golden).sort())
  })

  it.each(resolved.map((r) => [r.name]))(
    'resolves %s to the pinned shader',
    (name) => {
      expect(digests[name]).toBe(golden[name])
    },
  )

  it.each(Object.entries(FULL_TEXT))(
    'resolves %s to the pinned text',
    (name, path) => {
      const wgsl = resolved.find((r) => r.name === name)?.wgsl
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- a FULL_TEXT fixture path, in this repo
      expect(wgsl).toBe(readFileSync(path, 'utf8'))
    },
  )
})
