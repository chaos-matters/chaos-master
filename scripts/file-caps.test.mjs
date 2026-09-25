// Tests for scripts/file-caps.mjs, the per-file line caps behind
// `pnpm metrics:check`. Run with `node --test scripts/file-caps.test.mjs`
// (part of `pnpm test:scripts`).

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { atBucketEdge, CAP_FLOOR, capFailures, checkFileCaps, formatCaps, lowerCaps, } from './file-caps.mjs'

const counts = (entries) => new Map(Object.entries(entries))
const kinds = (r) =>
  Object.fromEntries(
    Object.entries(r).map(([k, v]) => [k, v.map((x) => x.file)]),
  )

await describe('checkFileCaps', async () => {
  await it('holds when every file over the floor sits exactly at its cap', () => {
    const r = checkFileCaps(counts({ 'a.ts': 900, 'b.ts': 120 }), {
      'a.ts': 900,
    })
    assert.deepEqual(capFailures(r), [])
  })

  await it('fails growth inside a file already far over the edge', () => {
    // BenchmarksPage.tsx: 2,786 -> 3,986 was green on the bucket counts.
    const r = checkFileCaps(counts({ 'big.tsx': 3986 }), { 'big.tsx': 2786 })
    assert.deepEqual(kinds(r).grew, ['big.tsx'])
    assert.match(
      capFailures(r)[0],
      /^big\.tsx: 3986 lines, over its cap of 2786\./,
    )
  })

  await it('fails one line of growth on a file parked at an edge', () => {
    const r = checkFileCaps(counts({ 'rec.ts': 1201, 'tl.ts': 801 }), {
      'rec.ts': 1200,
      'tl.ts': 800,
    })
    assert.deepEqual(kinds(r).grew, ['rec.ts', 'tl.ts'])
  })

  await it('caps a file of exactly the floor, not only one over it', () => {
    const r = checkFileCaps(counts({ 'edge.ts': CAP_FLOOR }), {})
    assert.deepEqual(kinds(r).uncapped, ['edge.ts'])
    const under = checkFileCaps(counts({ 'small.ts': CAP_FLOOR - 1 }), {})
    assert.deepEqual(capFailures(under), [])
  })

  await it('fails a shrink until the cap is lowered with it', () => {
    const r = checkFileCaps(counts({ 'a.ts': 950 }), { 'a.ts': 1000 })
    assert.deepEqual(kinds(r).shrank, ['a.ts'])
    assert.match(
      capFailures(r)[0],
      /^a\.ts shrank to 950 lines\. Lower its cap from 1000 to 950/,
    )
  })

  await it('reports a rename as a stale cap and an uncapped file', () => {
    const r = checkFileCaps(counts({ 'new/a.ts': 900 }), { 'old/a.ts': 900 })
    assert.deepEqual(kinds(r).stale, ['old/a.ts'])
    assert.deepEqual(kinds(r).uncapped, ['new/a.ts'])
    assert.match(
      capFailures(r).join('\n'),
      /old\/a\.ts has a cap of 900 but is gone/,
    )
    assert.match(
      capFailures(r).join('\n'),
      /new\/a\.ts: 900 lines and no cap\. Renamed/,
    )
  })

  await it('asks to remove the cap of a file that fell under the floor', () => {
    const r = checkFileCaps(counts({ 'a.ts': 640 }), { 'a.ts': 900 })
    assert.deepEqual(kinds(r).stale, ['a.ts'])
    assert.match(capFailures(r)[0], /has 640 lines, under 800\. Remove its cap/)
  })

  await it('does not take a key inherited from Object.prototype for a cap', () => {
    const r = checkFileCaps(counts({ constructor: 900 }), {})
    assert.deepEqual(kinds(r).uncapped, ['constructor'])
  })
})

await describe('lowerCaps', async () => {
  await it('lowers a cap to a file that shrank, and drops stale caps', () => {
    const out = lowerCaps(counts({ 'a.ts': 950, 'b.ts': 700, 'c.ts': 1000 }), {
      'a.ts': 1000,
      'b.ts': 900,
      'c.ts': 1000,
      'gone.ts': 1200,
    })
    assert.deepEqual(out, { 'a.ts': 950, 'c.ts': 1000 })
  })

  await it('never raises a cap and never adds one', () => {
    const c = counts({ 'grew.ts': 1300, 'new.ts': 900 })
    const out = lowerCaps(c, { 'grew.ts': 1200 })
    assert.deepEqual(out, { 'grew.ts': 1200 })
    // So the check still fails on both after lowering.
    const r = checkFileCaps(c, out)
    assert.deepEqual(kinds(r).grew, ['grew.ts'])
    assert.deepEqual(kinds(r).uncapped, ['new.ts'])
  })
})

await describe('atBucketEdge', async () => {
  await it('names the files sitting exactly on 500, 800 or 1200 lines', () => {
    const edge = atBucketEdge(
      counts({ 'a.ts': 1200, 'b.ts': 800, 'c.ts': 801, 'd.ts': 500 }),
    )
    assert.deepEqual(edge, [
      { file: 'a.ts', lines: 1200 },
      { file: 'b.ts', lines: 800 },
      { file: 'd.ts', lines: 500 },
    ])
  })
})

await describe('formatCaps', async () => {
  await it('writes one entry per line, sorted by path', () => {
    assert.equal(
      formatCaps({ 'b.ts': 900, 'a.ts': 1000 }),
      '{\n  "a.ts": 1000,\n  "b.ts": 900\n}\n',
    )
  })
})
