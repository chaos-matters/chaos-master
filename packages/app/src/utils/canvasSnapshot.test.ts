import { afterEach, describe, expect, it, vi } from 'vitest'
import { snapshotCanvas } from './canvasSnapshot'

/** A canvas that encodes to `blob`, recording the type it was asked for. */
const canvasEncodingTo = (blob: Blob | null) => {
  const types: (string | undefined)[] = []
  const canvas = {
    toBlob: (callback: BlobCallback, type?: string) => {
      types.push(type)
      callback(blob)
    },
  } as unknown as HTMLCanvasElement
  return { canvas, types }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('snapshotting a rendered frame', () => {
  it('decodes the encoded bytes, never the canvas itself', async () => {
    // A bitmap taken straight from a WebGPU canvas can alias it on some
    // drivers, so the encoder read a frame already cleared for the next one
    // and every frame of the video came out black.
    const png = new Blob(['frame'], { type: 'image/png' })
    const bitmap = {} as ImageBitmap
    const createImageBitmap = vi.fn(() => Promise.resolve(bitmap))
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const { canvas, types } = canvasEncodingTo(png)

    await expect(snapshotCanvas(canvas, 640, 360)).resolves.toBe(bitmap)

    expect(types).toEqual(['image/png'])
    expect(createImageBitmap).toHaveBeenCalledExactlyOnceWith(png, {
      resizeWidth: 640,
      resizeHeight: 360,
      resizeQuality: 'high',
    })
  })

  it('fails the export rather than encoding a frame it could not read', async () => {
    const createImageBitmap = vi.fn()
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const { canvas } = canvasEncodingTo(null)

    await expect(snapshotCanvas(canvas, 640, 360)).rejects.toThrow(
      'Could not read the rendered frame',
    )
    expect(createImageBitmap).not.toHaveBeenCalled()
  })
})
