import 'fake-indexeddb/auto'
import { zipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseFlameXml } from '@/flame/flameXml'
import { applyFlameImport, flameSignature, mergeHistoryEntries, mergeRecentFlames, parseBackupZip, parseFlameEnvelope, readFlameFiles, readSingleFlameFile, summarizeImport, } from './flameImport'
import { addFlameDataToPng } from './flameInPng'
import { compressJsonQueryParam } from './jsonQueryParam'
import { clearRecentFlames, loadRecentFlames, MAX_RECENT_FLAMES, } from './recentFlames'
import type { ImportCandidate, ImportSummary } from './flameImport'
import type { RecentFlame } from './recentFlames'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const SIMPLE_FLAME_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame name="Simple Test" version="Apophysis 7X" size="800 600"
       center="0 0" scale="200" oversample="1" filter="0.5"
       quality="100" background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" linear="1" coefs="1 0 0 1 0 0"/>
</flame>`

// Only the PNG signature is needed — addFlameDataToPng inserts the flame chunk
// right after it when no other chunks are present.
const MINIMAL_PNG = new Uint8Array(8)

const encoder = new TextEncoder()

// Parsed once: parseFlameXml mints a fresh random transform id per call, so
// re-parsing would produce flames that are never each other's duplicates.
const BASE_FLAME = parseFlameXml(SIMPLE_FLAME_XML)

function flame(name: string): FlameDescriptor {
  const copy = JSON.parse(JSON.stringify(BASE_FLAME)) as FlameDescriptor
  copy.metadata = { ...copy.metadata, name }
  return copy
}

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value, null, 2))
}

async function flamePng(
  descriptor: FlameDescriptor,
  animation?: { tracks: unknown[]; config: unknown },
): Promise<Uint8Array<ArrayBuffer>> {
  const encoded = await compressJsonQueryParam(
    animation ? { flame: descriptor, animation } : descriptor,
  )
  const blob = addFlameDataToPng(encoded, MINIMAL_PNG)
  return new Uint8Array(await blob.arrayBuffer())
}

/** The timeline the app writes into everything it exports: what says how
 *  fast the flame runs and how long it is. */
const CONFIG = {
  fps: 60,
  timeScale: 2,
  startFrame: 0,
  endFrame: 300,
  loop: false,
  autoFps: false,
  loopMode: 'seamless' as const,
}

const TRACKS = [
  {
    parameterPath: 'renderSettings.brightness',
    keyframes: [
      { frame: 0, value: 1 },
      { frame: 60, value: 2 },
    ],
  },
]

function recent(name: string, savedAt: number): RecentFlame {
  return { id: `id-${name}`, name, flame: flame(name), savedAt }
}

function candidate(
  name: string,
  overrides: Partial<ImportCandidate> = {},
): ImportCandidate {
  return {
    group: 'recents',
    name,
    flame: flame(name),
    savedAt: 1000,
    ...overrides,
  }
}

function summary(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return {
    recents: { added: 0, duplicates: 0, skippedFull: 0 },
    generated: { added: 0, duplicates: 0, skippedFull: 0 },
    logo: { added: 0, duplicates: 0, skippedFull: 0 },
    failed: 0,
    ...overrides,
  }
}

describe('parseFlameEnvelope', () => {
  it('reads a bare flame descriptor', () => {
    const parsed = parseFlameEnvelope(flame('Bare'))
    expect(parsed?.flame.metadata?.name).toBe('Bare')
    expect(parsed?.tracks).toBeUndefined()
  })

  it('reads the animated export envelope, keeping its tracks', () => {
    const parsed = parseFlameEnvelope({
      flame: flame('Animated'),
      animation: {
        tracks: [
          {
            parameterPath: 'renderSettings.exposure',
            keyframes: [{ frame: 0, value: 1 }],
          },
        ],
      },
    })
    expect(parsed?.flame.metadata?.name).toBe('Animated')
    expect(parsed?.tracks).toHaveLength(1)
  })

  it('reads a recent-flame backup record, keeping name and savedAt', () => {
    const parsed = parseFlameEnvelope({
      name: 'Saved as',
      savedAt: 42,
      flame: flame('Inner name'),
    })
    expect(parsed?.name).toBe('Saved as')
    expect(parsed?.savedAt).toBe(42)
  })

  it('drops keyframe tracks that do not match the timeline schema', () => {
    const parsed = parseFlameEnvelope({
      flame: flame('Junk tracks'),
      animation: { tracks: [{ parameterPath: 5, keyframes: 'nope' }] },
    })
    expect(parsed?.flame).toBeDefined()
    expect(parsed?.tracks).toBeUndefined()
  })

  it('rejects anything that is not a flame', () => {
    expect(parseFlameEnvelope(null)).toBeUndefined()
    expect(parseFlameEnvelope([flame('In an array')])).toBeUndefined()
    expect(parseFlameEnvelope({ hello: 'world' })).toBeUndefined()
    expect(
      parseFlameEnvelope({ flame: { transforms: 'nope' } }),
    ).toBeUndefined()
  })
})

describe('parseBackupZip', () => {
  it('pairs the .json and .png of one history flame into a single candidate', async () => {
    const descriptor = flame('Paired')
    const zip = zipSync({
      'manifest.json': jsonBytes({ app: 'Lumen Apeiron', counts: {} }),
      'generated/0001-paired.json': jsonBytes(descriptor),
      'generated/0001-paired.png': await flamePng(descriptor),
    })

    const parsed = await parseBackupZip(zip)

    expect(parsed.failed).toBe(0)
    expect(parsed.candidates).toHaveLength(1)
    expect(parsed.candidates[0]?.group).toBe('generated')
    expect(parsed.candidates[0]?.thumbnail).toMatch(/^data:image\/png;base64,/)
  })

  it('carries the timeline out of a PNG member, like its .json sibling', async () => {
    // The backup writes the animation into both halves of a history flame.
    // The PNG reader stopped at the tracks, so an archive restored through
    // its images came back at the workspace's defaults.
    const zip = zipSync({
      'generated/0001-anim.png': await flamePng(flame('Animated'), {
        tracks: TRACKS,
        config: CONFIG,
      }),
    })

    const parsed = await parseBackupZip(zip)

    expect(parsed.candidates[0]?.name).toBe('Animated')
    expect(parsed.candidates[0]?.config?.endFrame).toBe(300)
  })

  it('recovers a flame from the PNG when its .json sibling is corrupt', async () => {
    const descriptor = flame('Png only')
    const zip = zipSync({
      'logo/0001-broken.json': encoder.encode('{ not json'),
      'logo/0001-broken.png': await flamePng(descriptor),
    })

    const parsed = await parseBackupZip(zip)

    expect(parsed.failed).toBe(0)
    expect(parsed.candidates[0]?.flame.metadata?.name).toBe('Png only')
  })

  it('imports what is valid and counts the rest', async () => {
    const zip = zipSync({
      'recent-flames/0001-good.json': jsonBytes({
        name: 'Good',
        savedAt: 5,
        flame: flame('Good'),
      }),
      'recent-flames/0002-bad.json': encoder.encode('{"flame":{"nope":1}}'),
      'recent-flames/0003-truncated.json': encoder.encode('{"flame":'),
    })

    const parsed = await parseBackupZip(zip)

    expect(parsed.candidates.map((c) => c.name)).toEqual(['Good'])
    expect(parsed.candidates[0]?.savedAt).toBe(5)
    expect(parsed.failed).toBe(2)
  })

  it('honours the group selection and ignores the manifest', async () => {
    const zip = zipSync({
      'manifest.json': jsonBytes({ app: 'Lumen Apeiron' }),
      'recent-flames/0001-a.json': jsonBytes(flame('A')),
      'generated/0001-b.json': jsonBytes(flame('B')),
      'logo/0001-c.json': jsonBytes(flame('C')),
    })

    const parsed = await parseBackupZip(zip, {
      recents: true,
      generated: false,
      logo: false,
    })

    expect(parsed.candidates.map((c) => c.name)).toEqual(['A'])
    expect(parsed.failed).toBe(0)
  })

  it('treats files outside the backup folders as recent flames', async () => {
    const zip = zipSync({ 'loose.json': jsonBytes(flame('Loose')) })

    const parsed = await parseBackupZip(zip)

    expect(parsed.candidates[0]?.group).toBe('recents')
  })

  it('stamps history flames in archive order, newest first', async () => {
    const zip = zipSync({
      'generated/0001-first.json': jsonBytes(flame('First')),
      'generated/0002-second.json': jsonBytes(flame('Second')),
    })

    const parsed = await parseBackupZip(zip)
    const [first, second] = parsed.candidates

    expect(first?.savedAt).toBeGreaterThan(second?.savedAt ?? 0)
  })
})

describe('readSingleFlameFile', () => {
  // One flame opens straight away rather than going to Recents, and that path
  // had a reader of its own that stopped at the tracks. So the app wrote a
  // timeline into an exported PNG and read the same file back at the
  // workspace's defaults - 30fps over 90 frames, however it was authored.
  it('keeps the timeline out of a PNG the app exported', async () => {
    const png = new File(
      [await flamePng(flame('From PNG'), { tracks: TRACKS, config: CONFIG })],
      'a.png',
    )
    const parsed = await readSingleFlameFile(png)
    expect(parsed?.flame.metadata?.name).toBe('From PNG')
    expect(parsed?.tracks?.[0]?.parameterPath).toBe('renderSettings.brightness')
    expect(parsed?.config?.endFrame).toBe(300)
    expect(parsed?.config?.fps).toBe(60)
  })

  it('keeps the timeline out of a JSON envelope', async () => {
    const json = new File(
      [
        JSON.stringify({
          flame: flame('From JSON'),
          animation: { tracks: [], config: CONFIG },
        }),
      ],
      'b.json',
    )
    const parsed = await readSingleFlameFile(json)
    expect(parsed?.flame.metadata?.name).toBe('From JSON')
    expect(parsed?.config?.endFrame).toBe(300)
  })

  it('reads a bare descriptor and an Apophysis file, and rejects junk', async () => {
    const bare = new File([JSON.stringify(flame('Bare'))], 'c.json')
    expect((await readSingleFlameFile(bare))?.flame.metadata?.name).toBe('Bare')

    const xml = new File([SIMPLE_FLAME_XML], 'd.flame')
    expect((await readSingleFlameFile(xml))?.flame).toBeDefined()

    expect(
      await readSingleFlameFile(new File(['not a flame'], 'e.png')),
    ).toBeUndefined()
  })

  it('drops a timeline that does not validate, and keeps the flame', async () => {
    const json = new File(
      [
        JSON.stringify({
          flame: flame('Bad timeline'),
          animation: { tracks: [], config: { fps: 0, endFrame: -5 } },
        }),
      ],
      'f.json',
    )
    const parsed = await readSingleFlameFile(json)
    expect(parsed?.flame.metadata?.name).toBe('Bad timeline')
    expect(parsed?.config).toBeUndefined()
  })
})

describe('readFlameFiles', () => {
  it('reads dropped PNGs, JSON and ZIPs into recent-flame candidates', async () => {
    const png = new File([await flamePng(flame('From PNG'))], 'a.png')
    const json = new File([JSON.stringify(flame('From JSON'))], 'b.json')
    const zip = new File(
      [
        new Uint8Array(
          zipSync({
            'recent-flames/0001-c.json': jsonBytes(flame('From ZIP')),
          }),
        ),
      ],
      'c.zip',
    )

    const parsed = await readFlameFiles([png, json, zip])

    expect(parsed.failed).toBe(0)
    expect(parsed.candidates.map((c) => c.name)).toEqual([
      'From PNG',
      'From JSON',
      'From ZIP',
    ])
    expect(parsed.candidates.every((c) => c.group === 'recents')).toBe(true)
  })

  it('counts unreadable files without losing the readable ones', async () => {
    const good = new File([JSON.stringify(flame('Good'))], 'good.json')
    const junk = new File(['definitely not a flame'], 'junk.png')

    const parsed = await readFlameFiles([junk, good])

    expect(parsed.candidates.map((c) => c.name)).toEqual(['Good'])
    expect(parsed.failed).toBe(1)
  })
})

describe('flameSignature', () => {
  it('ignores key order so a round-tripped flame still matches', () => {
    const original = flame('Reordered')
    const shuffled = JSON.parse(
      JSON.stringify({
        transforms: original.transforms,
        version: original.version,
        metadata: original.metadata,
        renderSettings: original.renderSettings,
      }),
    ) as FlameDescriptor

    expect(flameSignature(shuffled)).toBe(flameSignature(original))
  })
})

describe('mergeRecentFlames', () => {
  const makeId = (() => {
    let n = 0
    return () => `new-${++n}`
  })()

  it('adds new flames newest-first and keeps their tracks', () => {
    const existing = [recent('Old', 100)]
    const tracks = [
      { parameterPath: 'renderSettings.exposure', keyframes: [] },
    ] as ImportCandidate['tracks']

    const { entries, outcome } = mergeRecentFlames(
      existing,
      [candidate('Newer', { savedAt: 500, tracks })],
      makeId,
    )

    expect(outcome).toEqual({ added: 1, duplicates: 0, skippedFull: 0 })
    expect(entries.map((e) => e.name)).toEqual(['Newer', 'Old'])
    expect(entries[0]?.tracks).toHaveLength(1)
  })

  it('skips a flame that is already stored instead of overwriting it', () => {
    const existing = [recent('Dup', 100)]

    const { entries, outcome } = mergeRecentFlames(
      existing,
      [candidate('Dup')],
      makeId,
    )

    expect(outcome).toEqual({ added: 0, duplicates: 1, skippedFull: 0 })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.id).toBe('id-Dup')
    expect(entries[0]?.savedAt).toBe(100)
  })

  it('dedupes repeats inside one batch', () => {
    const { entries, outcome } = mergeRecentFlames(
      [],
      [candidate('Twice'), candidate('Twice'), candidate('Once')],
      makeId,
    )

    expect(outcome.added).toBe(2)
    expect(outcome.duplicates).toBe(1)
    expect(entries).toHaveLength(2)
  })

  it('keeps the same name with a different flame as a separate entry', () => {
    const existing = [recent('Same name', 100)]
    const other = candidate('Same name')
    other.flame.renderSettings.exposure += 1

    const { outcome } = mergeRecentFlames(existing, [other], makeId)

    expect(outcome.added).toBe(1)
  })

  it('never evicts stored flames to make room', () => {
    const existing = Array.from({ length: MAX_RECENT_FLAMES }, (_, i) =>
      recent(`Stored ${i}`, i),
    )

    const { entries, outcome } = mergeRecentFlames(
      existing,
      [candidate('Too many'), candidate('Also too many')],
      makeId,
    )

    expect(outcome).toEqual({ added: 0, duplicates: 0, skippedFull: 2 })
    expect(entries).toHaveLength(MAX_RECENT_FLAMES)
    expect(entries.every((e) => e.name.startsWith('Stored'))).toBe(true)
  })
})

describe('mergeHistoryEntries', () => {
  it('only takes candidates that carry a thumbnail', () => {
    const { additions, outcome } = mergeHistoryEntries(
      [],
      [
        candidate('With image', { group: 'generated', thumbnail: 'data:png' }),
        candidate('Without image', { group: 'generated' }),
      ],
      10,
    )

    expect(outcome.added).toBe(1)
    expect(additions[0]?.thumbnail).toBe('data:png')
    expect(additions[0]?.timestamp).toBe(1000)
  })

  it('skips flames already in the store, ignoring their name', () => {
    const existing = [
      { flame: flame('Stored'), thumbnail: 'data:png', timestamp: 1 },
    ]

    const { additions, outcome } = mergeHistoryEntries(
      existing,
      [
        candidate('Renamed but identical', {
          group: 'generated',
          flame: flame('Stored'),
          thumbnail: 'data:png',
        }),
      ],
      10,
    )

    expect(outcome.duplicates).toBe(1)
    expect(additions).toHaveLength(0)
  })

  it('stops at the store cap so pruning cannot delete stored entries', () => {
    const existing = [
      { flame: flame('Stored'), thumbnail: 'data:png', timestamp: 1 },
    ]

    const { additions, outcome } = mergeHistoryEntries(
      existing,
      [
        candidate('A', { group: 'logo', thumbnail: 'data:png' }),
        candidate('B', { group: 'logo', thumbnail: 'data:png' }),
      ],
      2,
    )

    expect(outcome).toEqual({ added: 1, duplicates: 0, skippedFull: 1 })
    expect(additions).toHaveLength(1)
  })
})

describe('applyFlameImport', () => {
  // The runner's own localStorage is not writable, and the recents store lives
  // in it — back it with a plain in-memory map for these tests.
  const stored = new Map<string, string>()
  const memoryStorage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => {
      stored.set(key, value)
    },
    removeItem: (key: string) => {
      stored.delete(key)
    },
    clear: () => {
      stored.clear()
    },
    key: (index: number) => [...stored.keys()][index] ?? null,
    get length() {
      return stored.size
    },
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage)
    clearRecentFlames()
  })

  it('stores candidates in recent flames and reports duplicates on re-import', async () => {
    const candidates = [candidate('Imported A'), candidate('Imported B')]

    const first = await applyFlameImport(candidates)
    expect(first.recents.added).toBe(2)
    expect(loadRecentFlames().map((r) => r.name)).toEqual([
      'Imported A',
      'Imported B',
    ])

    const second = await applyFlameImport(candidates)
    expect(second.recents).toEqual({
      added: 0,
      duplicates: 2,
      skippedFull: 0,
    })
    expect(loadRecentFlames()).toHaveLength(2)
  })

  it('routes a history flame without an image to recent flames', async () => {
    const summary = await applyFlameImport([
      candidate('No image', { group: 'generated' }),
    ])

    expect(summary.recents.added).toBe(1)
    expect(summary.generated.added).toBe(0)
    expect(loadRecentFlames()).toHaveLength(1)
  })
})

describe('summarizeImport', () => {
  it('reports the total and where it landed', () => {
    expect(
      summarizeImport(
        summary({
          recents: { added: 8, duplicates: 3, skippedFull: 0 },
          generated: { added: 4, duplicates: 0, skippedFull: 0 },
        }),
      ),
    ).toBe('Imported 12 flames (8 recent, 4 generated), skipped 3 duplicates')
  })

  it('leaves out the breakdown when only one store was touched', () => {
    expect(
      summarizeImport(
        summary({ recents: { added: 1, duplicates: 0, skippedFull: 0 } }),
      ),
    ).toBe('Imported 1 flame')
  })

  it('reports what was dropped and what could not be read', () => {
    expect(
      summarizeImport(
        summary({
          recents: { added: 2, duplicates: 0, skippedFull: 5 },
          failed: 1,
        }),
      ),
    ).toBe('Imported 2 flames, 5 dropped (library full), 1 unreadable')
  })

  it('says so when nothing was found', () => {
    expect(summarizeImport(summary())).toBe('No flames found to import')
    expect(summarizeImport(summary({ failed: 2 }))).toBe(
      'Could not read 2 files',
    )
  })
})
