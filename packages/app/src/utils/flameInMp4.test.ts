import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { asciiBytes } from './binaryReader'
import { deepClone } from './clone'
import { createMetadataPayload, extractMetadataFromMp4, injectMetadataIntoMp4, } from './flameInMp4'
import { MAX_COMPRESSED_JSON_BYTES } from './jsonQueryParam'
import { defaultConfig } from './timeline'
import type { RecordedSession } from '@/recorder/schema'

/**
 * The flame has always ridden in a `flm3` box inside `moov/udta`; M5 adds the
 * recorded session to that same payload. Round-tripped through a real
 * inject/extract rather than unit-testing the encoder alone, so a mistake in
 * the box arithmetic would show up here.
 */

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length)
  new DataView(out.buffer).setUint32(0, out.length)
  out.set(asciiBytes(type), 4)
  out.set(payload, 8)
  return out
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** ftyp + moov(mvhd) + mdat — enough structure for findBox and the udta
 *  insertion, with no stco/co64 to patch. */
function minimalMp4(): ArrayBuffer {
  const mp4 = concat([
    box('ftyp', new Uint8Array(8)),
    box('moov', box('mvhd', new Uint8Array(8))),
    box('mdat', new Uint8Array(8)),
  ])
  return mp4.buffer.slice(0) as ArrayBuffer
}

const session: RecordedSession = {
  version: 1,
  app: { version: 'test', flameSchemaVersion: '1.0' },
  createdAt: '1970-01-01T00:00:00.000Z',
  initial: deepClone(examples.example1),
  actions: [{ t: 0, id: 'flame.setGamma', args: [2.4], label: 'Set Gamma' }],
  unnamedWriteCount: 0,
}

describe('flameInMp4 — embedded session (M5)', () => {
  it('round-trips the flame and the session together', async () => {
    const payload = await createMetadataPayload(
      examples.example1,
      [],
      defaultConfig(),
      session,
    )
    const patched = injectMetadataIntoMp4(minimalMp4(), payload)

    const extracted = await extractMetadataFromMp4(patched)
    expect(Object.keys(extracted?.flame.transforms ?? {})).toEqual(
      Object.keys(examples.example1.transforms),
    )
    expect(extracted?.session?.actions).toEqual(session.actions)
    expect(extracted?.session?.initial).toEqual(deepClone(examples.example1))
  })

  it('reports no session when the export carried none', async () => {
    const payload = await createMetadataPayload(
      examples.example1,
      [],
      defaultConfig(),
    )
    const patched = injectMetadataIntoMp4(minimalMp4(), payload)

    const extracted = await extractMetadataFromMp4(patched)
    // Every MP4 exported before this feature takes this path: the flame is
    // still there, and there is simply nothing to replay.
    expect(extracted?.flame).toBeDefined()
    expect(extracted?.session).toBeUndefined()
  })

  it('rejects oversized metadata before copying or decompressing it', () => {
    const oversized = box('flm3', new Uint8Array(MAX_COMPRESSED_JSON_BYTES + 1))
    const mp4 = concat([
      box('ftyp', new Uint8Array(8)),
      box('moov', box('udta', oversized)),
    ])

    expect(() =>
      extractMetadataFromMp4(mp4.buffer.slice(0) as ArrayBuffer),
    ).toThrow(/compressed JSON exceeds/i)
  })
})
