import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createHistoryDB } from './createHistoryDB'

interface Rec {
  id?: number
  timestamp: number
  label: string
}

describe('createHistoryDB', () => {
  it('round-trips entries ordered newest-first', async () => {
    const db = createHistoryDB<Rec>('test-history-roundtrip')
    await db.clear()
    await db.add({ timestamp: 1, label: 'a' }, 10)
    await db.add({ timestamp: 3, label: 'c' }, 10)
    await db.add({ timestamp: 2, label: 'b' }, 10)

    const all = await db.load(10)
    expect(all.map((e) => e.label)).toEqual(['c', 'b', 'a'])
  })

  it('prunes to maxCount, keeping the newest by timestamp', async () => {
    const db = createHistoryDB<Rec>('test-history-prune')
    await db.clear()
    for (let i = 1; i <= 5; i++) {
      await db.add({ timestamp: i, label: `e${i}` }, 3)
    }

    const all = await db.load(100)
    expect(all.map((e) => e.label)).toEqual(['e5', 'e4', 'e3'])
  })

  it('add() returns the capped, newest-first list', async () => {
    const db = createHistoryDB<Rec>('test-history-return')
    await db.clear()
    await db.add({ timestamp: 1, label: 'a' }, 2)
    const afterB = await db.add({ timestamp: 2, label: 'b' }, 2)
    const afterC = await db.add({ timestamp: 3, label: 'c' }, 2)

    expect(afterB.map((e) => e.label)).toEqual(['b', 'a'])
    expect(afterC.map((e) => e.label)).toEqual(['c', 'b'])
  })

  it('load respects its own maxCount limit', async () => {
    const db = createHistoryDB<Rec>('test-history-loadlimit')
    await db.clear()
    for (let i = 1; i <= 4; i++) {
      await db.add({ timestamp: i, label: `e${i}` }, 10)
    }
    expect((await db.load(2)).map((e) => e.label)).toEqual(['e4', 'e3'])
  })

  it('clear empties the store', async () => {
    const db = createHistoryDB<Rec>('test-history-clear')
    await db.add({ timestamp: 1, label: 'a' }, 10)
    await db.clear()
    expect(await db.load(10)).toEqual([])
  })
})
