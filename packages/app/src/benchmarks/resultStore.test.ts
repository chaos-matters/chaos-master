import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createBenchmarkResultStore } from './resultStore'
import { createTestBenchmarkManifest, createTestBenchmarkResult, } from './testFixtures'

const stores: ReturnType<typeof createBenchmarkResultStore>[] = []

function makeStore(name: string, maxEntries = 100) {
  const store = createBenchmarkResultStore({
    dbName: `benchmark-result-store-test-${name}`,
    maxEntries,
  })
  stores.push(store)
  return store
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.deleteDatabase()))
})

describe('benchmark result store', () => {
  it('stores self-contained entries newest-first and prunes the oldest', async () => {
    const store = makeStore('prune', 2)
    const manifest = createTestBenchmarkManifest()

    await store.save(manifest, createTestBenchmarkResult(manifest, 'run-1'), {
      savedAt: 1,
    })
    await store.save(manifest, createTestBenchmarkResult(manifest, 'run-3'), {
      savedAt: 3,
    })
    await store.save(manifest, createTestBenchmarkResult(manifest, 'run-2'), {
      savedAt: 2,
    })

    const entries = await store.list()
    expect(entries.map(({ id }) => id)).toEqual(['run-3', 'run-2'])
    expect(entries[0]).toMatchObject({
      manifestId: manifest.id,
      manifest,
      result: { id: 'run-3' },
    })
    expect(await store.get('run-1')).toBeUndefined()
  })

  it('filters, removes, and clears entries', async () => {
    const store = makeStore('operations')
    const firstManifest = createTestBenchmarkManifest('manifest-a')
    const secondManifest = createTestBenchmarkManifest('manifest-b')
    await store.save(
      firstManifest,
      createTestBenchmarkResult(firstManifest, 'completed', 'completed'),
      { savedAt: 1 },
    )
    await store.save(
      secondManifest,
      createTestBenchmarkResult(secondManifest, 'failed', 'failed'),
      { savedAt: 2 },
    )

    expect(await store.list({ status: 'failed' })).toHaveLength(1)
    expect(await store.list({ manifestId: firstManifest.id })).toHaveLength(1)

    await store.remove('completed')
    expect(await store.get('completed')).toBeUndefined()
    await store.clear()
    expect(await store.list()).toEqual([])
  })

  it('refuses inconsistent result/manifest pairs', async () => {
    const store = makeStore('invalid')
    const manifest = createTestBenchmarkManifest('manifest-a')
    const otherManifest = createTestBenchmarkManifest('manifest-b')
    const result = createTestBenchmarkResult(otherManifest)

    await expect(store.save(manifest, result)).rejects.toThrow(/invalid/)
  })
})
