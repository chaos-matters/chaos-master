import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseFlameXmlWithReport } from '@/flame/flameXml'
import { addFlameDataToPng } from '@/utils/flameInPng'
import { compressJsonQueryParam } from '@/utils/jsonQueryParam'
import { MAX_BENCHMARK_UPLOAD_SIZE, parseBenchmarkFlameUpload } from './upload'
import type { BenchmarkUploadFile } from './upload'

const XML_WITH_PALETTE = `<?xml version="1.0" encoding="UTF-8"?>
<flame name="Palette Flame" size="800 600" center="0 0" scale="200"
       background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" linear="1" coefs="1 0 0 1 0 0"/>
  <palette count="2" format="RGB">ff0000 0000ff</palette>
</flame>`

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

function memoryFile(
  name: string,
  bytes: Uint8Array,
  type?: string,
): BenchmarkUploadFile {
  return {
    name,
    size: bytes.byteLength,
    type,
    arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer),
  }
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => {
      values.clear()
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key)
    },
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseBenchmarkFlameUpload', () => {
  it('parses XML without registering its embedded palette', async () => {
    const paletteKey = 'chaos-master-custom-palettes'
    vi.stubGlobal('localStorage', memoryStorage())
    localStorage.setItem(paletteKey, '["sentinel"]')
    const bytes = new TextEncoder().encode(XML_WITH_PALETTE)

    const parsed = await parseBenchmarkFlameUpload(
      memoryFile('palette.flame', bytes, 'application/xml'),
    )

    expect(parsed).toMatchObject({
      format: 'flame-xml',
      source: {
        label: 'Palette Flame',
        source: 'upload',
        transformCount: 1,
      },
      warnings: [],
    })
    expect(localStorage.getItem(paletteKey)).toBe('["sentinel"]')
  })

  it('extracts embedded flame metadata from a PNG', async () => {
    const flame = parseFlameXmlWithReport(XML_WITH_PALETTE).flame
    const encoded = await compressJsonQueryParam(flame)
    const png = addFlameDataToPng(encoded, PNG_SIGNATURE)
    const pngBytes = new Uint8Array(await png.arrayBuffer())

    const parsed = await parseBenchmarkFlameUpload(
      memoryFile('render.png', pngBytes, 'image/png'),
    )
    expect(parsed).toMatchObject({
      format: 'png',
      source: {
        label: 'Palette Flame',
        source: 'upload',
        transformCount: 1,
      },
      warnings: [],
    })
  })

  it('returns stable errors for unsupported, invalid PNG, and oversized files', async () => {
    await expect(
      parseBenchmarkFlameUpload(
        memoryFile('notes.txt', new TextEncoder().encode('not a flame')),
      ),
    ).rejects.toMatchObject({
      code: 'unsupported-format',
    })
    await expect(
      parseBenchmarkFlameUpload(
        memoryFile('broken.png', new Uint8Array([1, 2, 3]), 'image/png'),
      ),
    ).rejects.toMatchObject({
      code: 'invalid-png',
    })

    let read = false
    await expect(
      parseBenchmarkFlameUpload({
        name: 'huge.png',
        size: MAX_BENCHMARK_UPLOAD_SIZE + 1,
        arrayBuffer: () => {
          read = true
          return Promise.resolve(new ArrayBuffer(0))
        },
      }),
    ).rejects.toMatchObject({
      code: 'too-large',
    })
    expect(read).toBe(false)
  })
})
