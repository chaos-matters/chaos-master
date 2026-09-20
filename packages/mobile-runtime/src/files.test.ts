import { describe, expect, it } from 'vitest'
import { base64Of, candidateNames, CHUNK_BYTES, isShareCancel, safeFileName, saveFileWith, shareBlobWith, } from './files'
import type { FilePorts, StorageArea } from './files'

const NOW = new Date('2026-09-11T10:38:12.345Z')
const OPTIONS = { folder: 'Lumen Apeiron' }

const decode = (base64: string): Uint8Array =>
  Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))

const sameBytes = (a: Uint8Array | undefined, b: Uint8Array): boolean =>
  a !== undefined &&
  a.length === b.length &&
  a.every((value, index) => value === b[index])

interface FakeOptions {
  /** Paths inside Documents that already exist. */
  readonly existing?: readonly string[]
  /** Paths inside Documents whose write is refused, like a file an earlier install left. */
  readonly refused?: readonly string[]
  /** Paths inside Documents whose stat fails for a reason other than absence. */
  readonly statRefused?: readonly string[]
  /** Every append into Documents fails, after the first chunk was written. */
  readonly appendRefused?: boolean
  readonly shareError?: Error
}

function fakePlatform(platform: string, options: FakeOptions = {}) {
  const files = new Map<string, Uint8Array>()
  const shared: string[] = []
  const key = (area: StorageArea, path: string) => `${area}:${path}`
  for (const path of options.existing ?? []) {
    files.set(key('documents', path), new Uint8Array())
  }
  const ports: FilePorts = {
    platform,
    exists: (path, area) => {
      if (area === 'documents' && options.statRefused?.includes(path)) {
        return Promise.reject(new Error('OS-PLUG-FILE-0013 stat failed'))
      }
      return Promise.resolve(files.has(key(area, path)))
    },
    write: (path, area, base64) => {
      if (area === 'documents' && options.refused?.includes(path)) {
        return Promise.reject(new Error('EACCES (Permission denied)'))
      }
      files.set(key(area, path), decode(base64))
      return Promise.resolve(`file:///${area}/${path}`)
    },
    append: (path, area, base64) => {
      if (area === 'documents' && options.appendRefused) {
        return Promise.reject(new Error('ENOSPC (No space left on device)'))
      }
      const before = files.get(key(area, path)) ?? new Uint8Array()
      const added = decode(base64)
      const joined = new Uint8Array(before.length + added.length)
      joined.set(before)
      joined.set(added, before.length)
      files.set(key(area, path), joined)
      return Promise.resolve()
    },
    remove: (path, area) => {
      files.delete(key(area, path))
      return Promise.resolve()
    },
    share: (uri) => {
      if (options.shareError) return Promise.reject(options.shareError)
      shared.push(uri)
      return Promise.resolve()
    },
  }
  return { ports, files, shared }
}

const png = (bytes: number[]) =>
  new Blob([new Uint8Array(bytes)], { type: 'image/png' })

describe('saveFileWith on Android', () => {
  it('writes into Documents under the app folder', async () => {
    const { ports, files } = fakePlatform('android')
    const outcome = await saveFileWith(
      ports,
      png([1, 2, 3]),
      'flame.png',
      OPTIONS,
      NOW,
    )
    expect(outcome).toEqual({
      kind: 'saved',
      location: 'Documents/Lumen Apeiron',
      fileName: 'flame.png',
      uri: 'file:///documents/Lumen Apeiron/flame.png',
    })
    expect(
      sameBytes(
        files.get('documents:Lumen Apeiron/flame.png'),
        new Uint8Array([1, 2, 3]),
      ),
    ).toBe(true)
  })

  it('numbers the name when a file already has it', async () => {
    const { ports } = fakePlatform('android', {
      existing: ['Lumen Apeiron/flame.png', 'Lumen Apeiron/flame (2).png'],
    })
    const outcome = await saveFileWith(
      ports,
      png([1]),
      'flame.png',
      OPTIONS,
      NOW,
    )
    expect(outcome).toMatchObject({ kind: 'saved', fileName: 'flame (3).png' })
  })

  it('moves past a name the platform refuses', async () => {
    const { ports } = fakePlatform('android', {
      refused: ['Lumen Apeiron/flame.png'],
    })
    const outcome = await saveFileWith(
      ports,
      png([1]),
      'flame.png',
      OPTIONS,
      NOW,
    )
    expect(outcome).toMatchObject({ kind: 'saved', fileName: 'flame (2).png' })
  })

  it('falls back to the share sheet when shared storage refuses twice', async () => {
    const { ports, shared } = fakePlatform('android', {
      refused: ['Lumen Apeiron/flame.png', 'Lumen Apeiron/flame (2).png'],
    })
    const outcome = await saveFileWith(
      ports,
      png([1]),
      'flame.png',
      OPTIONS,
      NOW,
    )
    expect(outcome).toEqual({ kind: 'shared' })
    expect(shared).toEqual(['file:///cache/exports/flame.png'])
  })

  it('counts a stat failure as a refusal', async () => {
    const { ports, shared } = fakePlatform('android', {
      statRefused: ['Lumen Apeiron/flame.png', 'Lumen Apeiron/flame (2).png'],
    })
    const outcome = await saveFileWith(
      ports,
      png([1]),
      'flame.png',
      OPTIONS,
      NOW,
    )
    expect(outcome).toEqual({ kind: 'shared' })
    expect(shared).toEqual(['file:///cache/exports/flame.png'])
  })

  it('removes a partial file and shares when a later chunk fails', async () => {
    const bytes = new Uint8Array(CHUNK_BYTES + 5)
    const { ports, files, shared } = fakePlatform('android', {
      appendRefused: true,
    })
    const outcome = await saveFileWith(
      ports,
      new Blob([bytes]),
      'clip.mp4',
      OPTIONS,
      NOW,
    )
    expect(outcome).toEqual({ kind: 'shared' })
    expect([...files.keys()]).toEqual(['cache:exports/clip.mp4'])
    expect(shared).toEqual(['file:///cache/exports/clip.mp4'])
  })

  it('reassembles a file larger than one bridge chunk', async () => {
    const bytes = new Uint8Array(CHUNK_BYTES + 5).map((_, index) => index % 251)
    const { ports, files } = fakePlatform('android')
    await saveFileWith(ports, new Blob([bytes]), 'clip.mp4', OPTIONS, NOW)
    expect(
      sameBytes(files.get('documents:Lumen Apeiron/clip.mp4'), bytes),
    ).toBe(true)
  })

  it('never lets a name escape the app folder', async () => {
    const { ports } = fakePlatform('android')
    const outcome = await saveFileWith(
      ports,
      png([1]),
      '../../Download/x.png',
      OPTIONS,
      NOW,
    )
    expect(outcome).toMatchObject({
      uri: 'file:///documents/Lumen Apeiron/-..-Download-x.png',
    })
  })
})

describe('saveFileWith on iOS', () => {
  it('shares from the cache instead of writing Documents', async () => {
    const { ports, files, shared } = fakePlatform('ios')
    const outcome = await saveFileWith(
      ports,
      png([7]),
      'duel.png',
      OPTIONS,
      NOW,
    )
    expect(outcome).toEqual({ kind: 'shared' })
    expect(shared).toEqual(['file:///cache/exports/duel.png'])
    expect([...files.keys()]).toEqual(['cache:exports/duel.png'])
  })

  it('reports a dismissed share sheet as cancelled', async () => {
    const { ports } = fakePlatform('ios', {
      shareError: new Error('Share canceled'),
    })
    await expect(
      saveFileWith(ports, png([7]), 'duel.png', OPTIONS, NOW),
    ).resolves.toEqual({ kind: 'cancelled' })
  })

  it('passes other share failures on', async () => {
    const { ports } = fakePlatform('ios', {
      shareError: new Error('No activity found'),
    })
    await expect(
      saveFileWith(ports, png([7]), 'duel.png', OPTIONS, NOW),
    ).rejects.toThrow('No activity found')
  })
})

describe('shareBlobWith', () => {
  it('goes to the share sheet even on Android', async () => {
    const { ports, files, shared } = fakePlatform('android')
    const outcome = await shareBlobWith(ports, png([3]), 'card.png')
    expect(outcome).toEqual({ kind: 'shared' })
    expect(shared).toEqual(['file:///cache/exports/card.png'])
    expect([...files.keys()]).toEqual(['cache:exports/card.png'])
  })
})

describe('file names', () => {
  it('keeps a name to one file in the folder', () => {
    expect(safeFileName('night/flame:1?.png')).toBe('night-flame-1-.png')
    expect(safeFileName('..hidden')).toBe('hidden')
    expect(safeFileName('  ')).toBe('file')
    expect(safeFileName(`${'a'.repeat(300)}.png`)).toBe(
      `${'a'.repeat(100)}.png`,
    )
  })

  it('numbers repeats like a browser, then stamps the time', () => {
    const names = candidateNames('flame.png', NOW)
    expect(names.slice(0, 3)).toEqual([
      'flame.png',
      'flame (2).png',
      'flame (3).png',
    ])
    expect(names.at(-1)).toBe('flame 2026-09-11T10-38-12-345Z.png')
    expect(candidateNames('notes', NOW)[1]).toBe('notes (2)')
  })

  it('treats only a dismissed share sheet as cancelled', () => {
    expect(isShareCancel(new Error('Share canceled'))).toBe(true)
    expect(isShareCancel({ message: ' Share cancelled ' })).toBe(true)
    expect(isShareCancel(new Error('Share canceled: no activity'))).toBe(false)
    expect(isShareCancel({ message: 'User cancelled' })).toBe(false)
    expect(isShareCancel(new Error('No activity found'))).toBe(false)
    expect(isShareCancel(undefined)).toBe(false)
  })
})

describe('base64Of', () => {
  it('round-trips every byte value', async () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index)
    expect(sameBytes(decode(await base64Of(new Blob([bytes]))), bytes)).toBe(
      true,
    )
  })
})
