import { describe, expect, it, vi } from 'vitest'
import { parseFlameXml } from '@/flame/flameXml'
import { calculateCRC32 } from './crc32'
import { addFlameDataToPng, extractFlameFromPng, extractStepsFromPng, } from './flameInPng'
import { compressJsonQueryParam, decompressJsonValue, MAX_COMPRESSED_JSON_BYTES, } from './jsonQueryParam'

const SIMPLE_FLAME_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flame name="Simple Test" version="Apophysis 7X" size="800 600"
       center="0 0" scale="200" oversample="1" filter="0.5"
       quality="100" background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" linear="1" coefs="1 0 0 1 0 0"/>
</flame>`

// The PNG signature is all these helpers need — insertion happens right
// after it when no other chunks are present.
const MINIMAL_PNG = new Uint8Array(8)

function u32be(n: number): Uint8Array {
  const buf = new ArrayBuffer(4)
  new DataView(buf).setUint32(0, n)
  return new Uint8Array(buf)
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

describe('flameInPng', () => {
  it('aborts decompression before an embedded JSON payload can expand unbounded', async () => {
    const compressed = await compressJsonQueryParam({
      text: 'highly-compressible'.repeat(100),
    })
    await expect(decompressJsonValue(compressed, 32)).rejects.toThrow(
      /exceeds 32 bytes/i,
    )
  })

  it('rejects an oversized compressed payload before opening a decompressor', async () => {
    const createStream = vi.fn()
    vi.stubGlobal('DecompressionStream', createStream)
    try {
      await expect(
        decompressJsonValue(new Uint8Array(MAX_COMPRESSED_JSON_BYTES + 1)),
      ).rejects.toThrow(/compressed JSON exceeds/i)
      expect(createStream).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('actively aborts a decompressor that stops making progress', async () => {
    vi.useFakeTimers()
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort')
    class StalledDecompressionStream {
      readonly readable = new ReadableStream<Uint8Array>({})
      readonly writable = new WritableStream<Uint8Array>({
        write: () => new Promise<void>(() => undefined),
      })
    }
    vi.stubGlobal('DecompressionStream', StalledDecompressionStream)
    try {
      const result = decompressJsonValue(new Uint8Array([1]))
      const rejection = expect(result).rejects.toThrow(
        /decompression timed out after 5s/i,
      )
      await vi.advanceTimersByTimeAsync(5000)
      await rejection
      expect(abortSpy).toHaveBeenCalled()
    } finally {
      abortSpy.mockRestore()
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })

  it('round-trips flame data embedded in a PNG', async () => {
    const flame = parseFlameXml(SIMPLE_FLAME_XML)
    const encoded = await compressJsonQueryParam(flame)
    const png = addFlameDataToPng(encoded, MINIMAL_PNG)
    const pngBytes = new Uint8Array(await png.arrayBuffer())

    const extracted = await extractFlameFromPng(pngBytes)
    expect(Object.keys(extracted.flame.transforms)).toHaveLength(1)
  })

  it('rejects a zTXt chunk with a valid separator but the wrong compression method', async () => {
    // A hand-built chunk (correct CRC, correct null separator) whose
    // compression-method byte isn't deflate. The validation guard used to
    // read `separatorByteIdx === -1 && ...`, which is always false whenever
    // a separator is present — silently letting a bad compression method
    // through to attempt (and confusingly fail inside) deflate decompression
    // instead of raising the intended "Compression type is invalid" error.
    const typeBytes = new TextEncoder().encode('zTXt')
    const keywordBytes = new TextEncoder().encode('FlameJson\0')
    const badCompressionMethod = new Uint8Array([0x01])
    const payload = new Uint8Array([1, 2, 3, 4])
    const chunkData = concat([keywordBytes, badCompressionMethod, payload])
    const crc = calculateCRC32(concat([typeBytes, chunkData]))
    const chunk = concat([
      u32be(chunkData.length),
      typeBytes,
      chunkData,
      u32be(crc),
    ])
    const png = concat([MINIMAL_PNG, chunk])

    await expect(extractFlameFromPng(png)).rejects.toThrow(
      /compression type is invalid/i,
    )
  })

  it('throws when no flame chunk is present', async () => {
    await expect(extractFlameFromPng(MINIMAL_PNG)).rejects.toThrow()
  })
})

describe('flameInPng — embedded session (M5)', () => {
  const session = {
    version: 1,
    app: { version: 'test', flameSchemaVersion: '1.0' },
    createdAt: '1970-01-01T00:00:00.000Z',
    initial: { placeholder: true },
    actions: [{ t: 0, id: 'flame.setGamma', args: [2.4], label: 'Set Gamma' }],
    unnamedWriteCount: 0,
  }

  it('carries the flame and the session in separate chunks', async () => {
    const flame = parseFlameXml(SIMPLE_FLAME_XML)
    const png = addFlameDataToPng(
      await compressJsonQueryParam(flame),
      MINIMAL_PNG,
      await compressJsonQueryParam(session),
    )
    const bytes = new Uint8Array(await png.arrayBuffer())

    // Both keywords must resolve to their OWN payload. 'FlameJson' and
    // 'FlameSteps' differ in length, so a reader slicing at a fixed keyword
    // width would decode one chunk at the other's offset.
    const extractedFlame = await extractFlameFromPng(bytes)
    expect(Object.keys(extractedFlame.flame.transforms)).toHaveLength(1)
    expect(await extractStepsFromPng(bytes)).toEqual(session)
  })

  it('reports no session for a PNG that carries only a flame', async () => {
    const flame = parseFlameXml(SIMPLE_FLAME_XML)
    const png = addFlameDataToPng(
      await compressJsonQueryParam(flame),
      MINIMAL_PNG,
    )
    const bytes = new Uint8Array(await png.arrayBuffer())
    // Every PNG exported before this feature takes this path; it must be a
    // quiet "nothing to replay", not a failure.
    expect(await extractStepsFromPng(bytes)).toBeUndefined()
    expect(
      Object.keys((await extractFlameFromPng(bytes)).flame.transforms),
    ).toHaveLength(1)
  })
})
