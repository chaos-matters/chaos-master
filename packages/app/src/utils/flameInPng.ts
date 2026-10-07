/**
 * What a saved PNG carries besides its pixels, in zTXt chunks: the flame
 * (`FlameJson`), the recorded session that made it (`FlameSteps`), and for a
 * deep-zoom picture the explorer location it shows (`ExplorerLocation`).
 * One chunk writer and one reader serve all three keywords.
 */
import { formatExplorerHash, parseExplorerHash } from '@chaos-master/core'
import { asciiBytes, readAsciiBytes, writeUint32BE } from './binaryReader'
import { calculateCRC32 } from './crc32'
import { coerceFlamePayload, compressJsonQueryParam, concatBuffers, decompressJsonValue, MAX_COMPRESSED_JSON_BYTES, } from './jsonQueryParam'
import type { ExplorerLocation } from '@chaos-master/core'
import type { SharePayload } from './jsonQueryParam'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const PNG_HEADER_SIZE_IN_BYTES = 8
const CHUNK_KEY_STRING = 'FlameJson'
/** Second zTXt keyword: the recorded session that produced the flame, so a
 *  dropped PNG can offer "replay this creation" as well as "load this flame"
 *  (docs/plans/semantic-recorder-plan.md, M5). */
export const STEPS_CHUNK_KEY_STRING = 'FlameSteps'
/** Third zTXt keyword: a deep-zoom picture's explorer location, stored as
 *  the link fragment (`formatExplorerHash`), so the PNG and the link share
 *  one format. Dropping the PNG reopens the place it shows. */
export const EXPLORER_CHUNK_KEY_STRING = 'ExplorerLocation'
/** A fragment for a view at 1e1000, in both panes of a split, is under 8 KB. */
const MAX_EMBEDDED_EXPLORER_BYTES = 64 * 1024
const MAX_EMBEDDED_STEPS_BYTES = 8 * 1024 * 1024
const CHUNK_TYPE_SIZE_IN_BYTES = 4
const CHUNK_LENGTH_SIZE_IN_BYTES = 4
const CHUNK_CRC_SIZE_IN_BYTES = 4
const CHUNK_KEY_END_SIZE_IN_BYTES = 1
const CHUNK_COMPRESSION_SIZE_IN_BYTES = 1
const CHUNK_COMPRESSION_DEFLATE = 0x00
const CHUNK_HEADER_SIZE_IN_BYTES =
  CHUNK_LENGTH_SIZE_IN_BYTES + CHUNK_TYPE_SIZE_IN_BYTES
// zTXt type specifies compressed PNG Latin-1 text
const ztxtTypeBytes = new Uint8Array([0x7a, 0x54, 0x58, 0x74])
// convert key to ASCII and add null separator
const keywordBytesFor = (keyword: string) => asciiBytes(`${keyword}\0`)
// compression method (0 for deflate)
const compressionMethod = new Uint8Array([CHUNK_COMPRESSION_DEFLATE])

function insertZtxtChunk(
  imageData: Uint8Array,
  encodedDataBytes: Uint8Array,
  keyword: string = CHUNK_KEY_STRING,
) {
  // construct zTXt chunk data: [keywordBytes] + [compressionMethod] + [encodedData]
  const ztxtChunkData = concatBuffers([
    keywordBytesFor(keyword),
    compressionMethod,
    encodedDataBytes,
  ])

  // calculate CRC32 on all chunk bytes except length
  const chunkCRC = calculateCRC32(concatBuffers([ztxtTypeBytes, ztxtChunkData]))
  // create zTXt chunk: [Length] + [Type] + [Data] + [CRC]
  const chunkLength = writeUint32BE(ztxtChunkData.length)
  const chunkCRCBytes = writeUint32BE(chunkCRC)
  const zTXtChunk = concatBuffers([
    chunkLength,
    ztxtTypeBytes,
    ztxtChunkData,
    chunkCRCBytes,
  ])

  // find insertion point before IDAT
  let imagePos = PNG_HEADER_SIZE_IN_BYTES
  while (imagePos < imageData.length) {
    const chunkLength = new DataView(imageData.buffer).getUint32(imagePos)
    const chunkType = readAsciiBytes(
      imageData,
      imagePos + CHUNK_LENGTH_SIZE_IN_BYTES,
      CHUNK_TYPE_SIZE_IN_BYTES,
    )
    if (chunkType === 'IDAT') {
      break
    }
    imagePos +=
      CHUNK_TYPE_SIZE_IN_BYTES +
      CHUNK_LENGTH_SIZE_IN_BYTES +
      chunkLength +
      CHUNK_CRC_SIZE_IN_BYTES
  }

  // construct new PNG with inserted chunk
  const newPngBytes = concatBuffers([
    imageData.slice(0, imagePos),
    zTXtChunk,
    imageData.slice(imagePos),
  ])

  return newPngBytes
}

async function readZtxtChunk(
  chunkPos: number,
  chunkLength: number,
  imageData: Uint8Array,
  maxOutputBytes?: number,
) {
  const chunkTypePos = chunkPos + CHUNK_LENGTH_SIZE_IN_BYTES
  const chunkEnd =
    chunkTypePos +
    CHUNK_TYPE_SIZE_IN_BYTES +
    chunkLength +
    CHUNK_CRC_SIZE_IN_BYTES
  if (chunkEnd > imageData.byteLength) {
    throw new Error('PNG chunk is truncated')
  }
  const chunkData = imageData.subarray(
    chunkTypePos,
    chunkTypePos + CHUNK_TYPE_SIZE_IN_BYTES + chunkLength,
  )
  const chunkDataPos = chunkTypePos + CHUNK_TYPE_SIZE_IN_BYTES
  // index of \0, keyword should not have 0 value according to spec
  const separatorByteIdx = chunkData.indexOf(0)
  if (
    separatorByteIdx === -1 ||
    chunkData[separatorByteIdx + 1] !== CHUNK_COMPRESSION_DEFLATE
  ) {
    throw new Error(
      `Compression type is invalid. Please use type: ${CHUNK_COMPRESSION_DEFLATE}`,
    )
  }

  // Sliced from the separator the spec guarantees, not from a fixed keyword
  // length: 'FlameJson' and 'FlameSteps' differ in length, and a constant
  // here would read one chunk's payload at the other's offset.
  const payloadOffset =
    separatorByteIdx +
    CHUNK_KEY_END_SIZE_IN_BYTES +
    CHUNK_COMPRESSION_SIZE_IN_BYTES
  const compressedLength = chunkData.byteLength - payloadOffset
  if (compressedLength > MAX_COMPRESSED_JSON_BYTES) {
    throw new Error(
      `Compressed JSON exceeds ${MAX_COMPRESSED_JSON_BYTES} bytes`,
    )
  }

  const crcIdx = chunkDataPos + chunkLength
  const crcData = imageData.slice(crcIdx, crcIdx + CHUNK_CRC_SIZE_IN_BYTES)
  const readCrc = new DataView(crcData.buffer).getUint32(0)
  // crc is calculated on all chunk segments except for length (first one)
  const calculatedCrc = calculateCRC32(chunkData)
  if (readCrc !== calculatedCrc) {
    throw new Error(`CRC mismatch: PNG: [${readCrc}] ::  [${calculatedCrc}]`)
  }
  // Copy only after the input budget has bounded the allocation. This also
  // guarantees an ArrayBuffer-backed view for DecompressionStream.
  const compressedData = chunkData.slice(payloadOffset)
  // Raw here: what the payload MEANS depends on the keyword, so the
  // caller validates (a flame for FlameJson, a session for FlameSteps).
  return await decompressJsonValue(compressedData, maxOutputBytes)
}

const MAX_OUTPUT_BYTES_BY_KEYWORD: Partial<Record<string, number>> = {
  [STEPS_CHUNK_KEY_STRING]: MAX_EMBEDDED_STEPS_BYTES,
  [EXPLORER_CHUNK_KEY_STRING]: MAX_EMBEDDED_EXPLORER_BYTES,
}

/**
 * Scan for OUR zTXt chunk with this keyword and decode its payload.
 * Undefined when the PNG has no such chunk; other zTXt chunks are ignored,
 * which is what lets the flame and its recorded session sit side by side.
 *
 * The keyword is compared up to the NUL the spec requires rather than over a
 * fixed width, so keywords of different lengths both match correctly.
 */
async function findZtxtPayload(
  imageData: Uint8Array,
  keyword: string,
): Promise<unknown | undefined> {
  let imagePos = PNG_HEADER_SIZE_IN_BYTES
  while (imagePos < imageData.length) {
    const chunkLength = new DataView(imageData.buffer).getUint32(imagePos)
    const chunkType = readAsciiBytes(
      imageData,
      imagePos + CHUNK_LENGTH_SIZE_IN_BYTES,
      CHUNK_TYPE_SIZE_IN_BYTES,
    )
    if (chunkType === 'zTXt') {
      const chunkKeyword = readAsciiBytes(
        imageData,
        imagePos + CHUNK_HEADER_SIZE_IN_BYTES,
        Math.min(keyword.length, chunkLength),
      )
      const terminatorPos =
        imagePos + CHUNK_HEADER_SIZE_IN_BYTES + keyword.length
      if (chunkKeyword === keyword && imageData[terminatorPos] === 0) {
        return await readZtxtChunk(
          imagePos,
          chunkLength,
          imageData,
          MAX_OUTPUT_BYTES_BY_KEYWORD[keyword],
        )
      }
    }

    imagePos +=
      CHUNK_LENGTH_SIZE_IN_BYTES +
      CHUNK_TYPE_SIZE_IN_BYTES +
      chunkLength +
      CHUNK_CRC_SIZE_IN_BYTES
  }
  return undefined
}

export async function extractFlameFromPng(
  imageData: Uint8Array,
): Promise<{ flame: FlameDescriptor; animation?: SharePayload['animation'] }> {
  const payload = await findZtxtPayload(imageData, CHUNK_KEY_STRING)
  if (payload === undefined) {
    throw new Error('Cannot find flame data. ')
  }
  return coerceFlamePayload(payload)
}

/**
 * The recorded session embedded alongside the flame, if any. Undefined
 * covers both "this PNG predates step recording" and "the chunk is
 * unreadable" — either way there is simply nothing to replay.
 */
export async function extractStepsFromPng(
  imageData: Uint8Array,
): Promise<unknown | undefined> {
  try {
    return await findZtxtPayload(imageData, STEPS_CHUNK_KEY_STRING)
  } catch (err) {
    console.warn('[flameInPng] unreadable FlameSteps chunk', err)
    return undefined
  }
}

export function addFlameDataToPng(
  flameData: Uint8Array,
  imageData: Uint8Array,
  /** Optional recorded session, embedded as a second chunk. */
  stepsData?: Uint8Array,
): Blob {
  let newImageData = insertZtxtChunk(imageData, flameData)
  if (stepsData) {
    newImageData = insertZtxtChunk(
      newImageData,
      stepsData,
      STEPS_CHUNK_KEY_STRING,
    )
  }
  return new Blob([newImageData], { type: 'image/png' })
}

/** A fragment the explorer wrote: `#mandelbrot?...` or `#julia?...`. */
const EXPLORER_FRAGMENT = /^#(?:mandelbrot|julia)\?/

/**
 * The explorer's picture with its location embedded, so dropping the file
 * on the explorer or the editor reopens that place in those colours.
 */
export async function addExplorerLocationToPng(
  imageData: Uint8Array,
  location: ExplorerLocation,
): Promise<Blob> {
  const encoded = await compressJsonQueryParam(formatExplorerHash(location))
  return new Blob(
    [insertZtxtChunk(imageData, encoded, EXPLORER_CHUNK_KEY_STRING)],
    { type: 'image/png' },
  )
}

/**
 * The explorer location a PNG carries, or undefined: a flame PNG, a plain
 * picture, a file that is no PNG at all, and a chunk that cannot be read
 * all carry none.
 */
export async function extractExplorerFromPng(
  image: Blob | Uint8Array,
): Promise<ExplorerLocation | undefined> {
  try {
    const bytes =
      image instanceof Uint8Array
        ? // The chunk scan reads the whole buffer from offset 0.
          image.byteOffset === 0
          ? image
          : image.slice()
        : new Uint8Array(await image.arrayBuffer())
    const fragment = await findZtxtPayload(bytes, EXPLORER_CHUNK_KEY_STRING)
    if (typeof fragment !== 'string' || !EXPLORER_FRAGMENT.test(fragment)) {
      return undefined
    }
    return parseExplorerHash(fragment)
  } catch {
    return undefined
  }
}
