import { compressJsonQueryParam, concatBuffers, decompressJsonPayload, } from './jsonQueryParam'
import type { SharePayload } from './jsonQueryParam'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineConfig, TimelineTrack } from '@/utils/timeline'

const BOX_HEADER_SIZE = 8 // 4 bytes size + 4 bytes type

function readUint32BE(view: DataView, offset: number): number {
  return view.getUint32(offset)
}

function boxTypeAt(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset + 4),
    view.getUint8(offset + 5),
    view.getUint8(offset + 6),
    view.getUint8(offset + 7),
  )
}

function writeUint32BE(value: number): Uint8Array {
  const buf = new ArrayBuffer(4)
  new DataView(buf).setUint32(0, value)
  return new Uint8Array(buf)
}

function asciiBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

/** Build a complete MP4 box: [size:4][type:4][payload] */
function buildBox(type: string, payload: Uint8Array): Uint8Array {
  const typeBytes = asciiBytes(type)
  const size = BOX_HEADER_SIZE + payload.length
  const header = writeUint32BE(size)
  return concatBuffers([header, typeBytes, payload])
}

/** Parse an MP4 buffer to find a top-level box by type. Returns { offset, size, dataOffset }. */
function findBox(
  buffer: ArrayBuffer,
  boxType: string,
): { offset: number; size: number; dataOffset: number } | null {
  const view = new DataView(buffer)
  let offset = 0
  while (offset + BOX_HEADER_SIZE <= buffer.byteLength) {
    const size = readUint32BE(view, offset)
    if (size < BOX_HEADER_SIZE || offset + size > buffer.byteLength) break
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    )
    if (type === boxType) {
      return { offset, size, dataOffset: offset + BOX_HEADER_SIZE }
    }
    offset += size
  }
  return null
}

/** Return the absolute byte offset of the end of a box's children (where new children can be inserted). */
function boxChildrenEnd(
  view: DataView,
  boxOffset: number,
  boxSize: number,
): number {
  const end = boxOffset + boxSize
  let childOffset = boxOffset + BOX_HEADER_SIZE
  while (childOffset + BOX_HEADER_SIZE <= end) {
    const childSize = readUint32BE(view, childOffset)
    if (childSize < BOX_HEADER_SIZE || childOffset + childSize > end) break
    childOffset += childSize
  }
  return childOffset
}

export function createMetadataPayload(
  flame: FlameDescriptor,
  tracks: TimelineTrack[],
  config: TimelineConfig,
): Promise<Uint8Array> {
  const payload: SharePayload & {
    animation: NonNullable<SharePayload['animation']>
  } = {
    flame,
    animation: { tracks, config },
  }
  return compressJsonQueryParam(payload)
}

/** Walk boxes within [rangeStart, rangeStart+rangeSize) and increment
 *  every chunk offset in stco/co64 by `shift`. */
function patchChunkOffsets(
  buffer: Uint8Array,
  rangeStart: number,
  rangeSize: number,
  shift: number,
): void {
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset + rangeStart,
    rangeSize,
  )
  let offset = 0
  while (offset + BOX_HEADER_SIZE <= rangeSize) {
    const size = readUint32BE(view, offset)
    if (size < BOX_HEADER_SIZE || offset + size > rangeSize) break
    const type = boxTypeAt(view, offset)
    const payloadStart = offset + BOX_HEADER_SIZE
    const payloadEnd = offset + size

    if (type === 'stco') {
      const entryCount = view.getUint32(payloadStart + 4)
      for (let i = 0; i < entryCount; i++) {
        const entryOff = payloadStart + 8 + i * 4
        view.setUint32(entryOff, view.getUint32(entryOff) + shift)
      }
    } else if (type === 'co64') {
      const entryCount = view.getUint32(payloadStart + 4)
      for (let i = 0; i < entryCount; i++) {
        const entryOff = payloadStart + 8 + i * 8
        const hi = view.getUint32(entryOff)
        const lo = view.getUint32(entryOff + 4)
        const val = (BigInt(hi) << 32n) | BigInt(lo)
        const newVal = val + BigInt(shift)
        view.setUint32(entryOff, Number(newVal >> 32n))
        view.setUint32(entryOff + 4, Number(newVal & 0xffffffffn))
      }
    } else {
      // Recurse into container boxes (moov, trak, mdia, minf, stbl, etc.)
      patchChunkOffsets(
        buffer,
        rangeStart + payloadStart,
        size - BOX_HEADER_SIZE,
        shift,
      )
    }

    offset = payloadEnd
  }
}

/** Inject flame+animation metadata as a custom `flm3` box inside `udta` under `moov`. */
export function injectMetadataIntoMp4(
  mp4Buffer: ArrayBuffer,
  metadataPayload: Uint8Array,
): ArrayBuffer {
  const view = new DataView(mp4Buffer)
  const moov = findBox(mp4Buffer, 'moov')
  if (!moov) {
    console.warn('[flameInMp4] moov box not found, skipping metadata injection')
    return mp4Buffer
  }

  const flm3Box = buildBox('flm3', metadataPayload)
  const udtaBox = buildBox('udta', flm3Box)
  const insertAt = boxChildrenEnd(view, moov.offset, moov.size)
  const shift = udtaBox.length

  // Copy the entire buffer so we can patch stco/co64 in-place before slicing.
  const buffer = new Uint8Array(mp4Buffer)

  // Bump chunk offsets in stco/co64 to account for the udta insertion shifting mdat.
  patchChunkOffsets(buffer, moov.offset, moov.size, shift)

  const before = buffer.subarray(0, insertAt)
  const after = buffer.subarray(insertAt)

  const newMoovSize = moov.size + shift
  const newMoovSizeBytes = writeUint32BE(newMoovSize)

  // Patch the moov size field (at moov.offset)
  before.set(newMoovSizeBytes, moov.offset)

  return concatBuffers([before, udtaBox, after]).buffer
}

/** Extract flame+animation metadata from an MP4 buffer. */
export function extractMetadataFromMp4(mp4Buffer: ArrayBuffer): Promise<{
  flame: FlameDescriptor
  animation?: SharePayload['animation']
} | null> {
  const moov = findBox(mp4Buffer, 'moov')
  if (!moov) {
    console.warn('[flameInMp4] moov box not found')
    return Promise.resolve(null)
  }

  // Parse moov children to find udta → flm3
  const view = new DataView(mp4Buffer)
  const moovEnd = moov.offset + moov.size
  let childOffset = moov.offset + BOX_HEADER_SIZE

  while (childOffset + BOX_HEADER_SIZE <= moovEnd) {
    const childSize = readUint32BE(view, childOffset)
    if (childSize < BOX_HEADER_SIZE || childOffset + childSize > moovEnd) break

    const childType = String.fromCharCode(
      view.getUint8(childOffset + 4),
      view.getUint8(childOffset + 5),
      view.getUint8(childOffset + 6),
      view.getUint8(childOffset + 7),
    )

    if (childType === 'udta') {
      const udtaDataOffset = childOffset + BOX_HEADER_SIZE
      const udtaEnd = childOffset + childSize
      let udtaChildOffset = udtaDataOffset

      while (udtaChildOffset + BOX_HEADER_SIZE <= udtaEnd) {
        const udtaChildSize = readUint32BE(view, udtaChildOffset)
        if (
          udtaChildSize < BOX_HEADER_SIZE ||
          udtaChildOffset + udtaChildSize > udtaEnd
        )
          break

        const udtaChildType = String.fromCharCode(
          view.getUint8(udtaChildOffset + 4),
          view.getUint8(udtaChildOffset + 5),
          view.getUint8(udtaChildOffset + 6),
          view.getUint8(udtaChildOffset + 7),
        )

        if (udtaChildType === 'flm3') {
          const payloadOffset = udtaChildOffset + BOX_HEADER_SIZE
          const payloadLength = udtaChildSize - BOX_HEADER_SIZE
          const payload = new Uint8Array(
            mp4Buffer.slice(payloadOffset, payloadOffset + payloadLength),
          )
          return decompressJsonPayload(payload)
        }

        udtaChildOffset += udtaChildSize
      }
    }

    childOffset += childSize
  }

  return Promise.resolve(null)
}
