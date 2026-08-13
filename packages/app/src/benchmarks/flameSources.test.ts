import { describe, expect, it } from 'vitest'
import { example2 } from '@/flame/examples/example2'
import { deepClone } from '@/utils/clone'
import { benchmarkFlameDigest, createBenchmarkFlameSource, createSeededSurpriseFlame, listAncestryBenchmarkFlames, listBuiltinBenchmarkFlames, listRecentBenchmarkFlames, toBenchmarkFlameV1, } from './flameSources'
import type { AncestryNode } from '@/flame/ancestry'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { RecentFlame } from '@/utils/recentFlames'

describe('benchmark flame source descriptors', () => {
  it('creates stable digests independent of object key insertion order', () => {
    const reordered = {
      transforms: deepClone(example2.transforms),
      renderSettings: deepClone(example2.renderSettings),
      metadata: deepClone(example2.metadata),
      version: example2.version,
    } as FlameDescriptor

    expect(benchmarkFlameDigest(reordered)).toBe(benchmarkFlameDigest(example2))
  })

  it('snapshots source flames instead of retaining mutable references', () => {
    const source = createBenchmarkFlameSource(example2, {
      id: 'builtin:small',
      source: 'builtin',
    })
    const originalExposure = example2.renderSettings.exposure

    source.flame.renderSettings.exposure = originalExposure + 1
    expect(example2.renderSettings.exposure).toBe(originalExposure)

    const manifestFlame = toBenchmarkFlameV1(source)
    expect(manifestFlame).toMatchObject({
      id: 'builtin:small',
      source: 'builtin',
      digest: source.digest,
    })
    expect(manifestFlame.snapshot).toBeDefined()
  })

  it('adapts built-ins, recents, and ancestry with useful provenance', () => {
    const builtins = listBuiltinBenchmarkFlames({ small: example2 })
    expect(builtins[0]).toMatchObject({
      id: 'builtin:small',
      source: 'builtin',
      provenance: { sourceKey: 'small' },
    })

    const recent: RecentFlame[] = [
      {
        id: 'older',
        name: 'Older',
        savedAt: 10,
        flame: example2,
      },
      {
        id: 'newer',
        name: 'Newer',
        savedAt: 20,
        flame: example2,
      },
    ]
    expect(listRecentBenchmarkFlames(recent).map(({ id }) => id)).toEqual([
      'recent:newer',
      'recent:older',
    ])

    const nodes: AncestryNode[] = [
      {
        hash: 'child',
        name: 'Child',
        parentA: 'parent-a',
        parentB: 'parent-b',
        generation: 2,
        createdAt: 30,
        flame: example2,
      },
    ]
    expect(listAncestryBenchmarkFlames(nodes)[0]).toMatchObject({
      id: 'ancestry:child',
      source: 'gallery',
      provenance: {
        generation: 2,
        parentA: 'parent-a',
        parentB: 'parent-b',
      },
    })
  })
})

describe('createSeededSurpriseFlame', () => {
  it('reproduces the same canonical flame for the same seed', () => {
    const first = createSeededSurpriseFlame(82)
    const second = createSeededSurpriseFlame(82)
    const other = createSeededSurpriseFlame(83)

    expect(first.id).toBe('generated:surprise:82')
    expect(first.provenance.seed).toBe(82)
    expect(first.digest).toBe(second.digest)
    expect(first.flame).toEqual(second.flame)
    expect(first.digest).not.toBe(other.digest)
  })

  it('rejects non-integral seeds', () => {
    expect(() => createSeededSurpriseFlame(1.5)).toThrow(/safe integer/)
  })
})
