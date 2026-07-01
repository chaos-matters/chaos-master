import { describe, expect, it } from 'vitest'
import { parseFlameXml } from '@/flame/flameXml'
import { calculateCRC32 } from './crc32'
import { addFlameDataToPng, extractFlameFromPng } from './flameInPng'
import { compressJsonQueryParam } from './jsonQueryParam'

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
