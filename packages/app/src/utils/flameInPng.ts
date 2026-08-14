import { asciiBytes, readAsciiBytes, writeUint32BE } from './binaryReader'
import { calculateCRC32 } from './crc32'
import { coerceFlamePayload, concatBuffers, decompressJsonValue, MAX_COMPRESSED_JSON_BYTES, } from './jsonQueryParam'
import type { SharePayload } from './jsonQueryParam'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const PNG_HEADER_SIZE_IN_BYTES = 8
const CHUNK_KEY_STRING = 'FlameJson'
/** Second zTXt keyword: the recorded session that produced the flame, so a
 *  dropped PNG can offer "replay this creation" as well as "load this flame"
 *  (docs/plans/semantic-recorder-plan.md, M5). */
export const STEPS_CHUNK_KEY_STRING = 'FlameSteps'
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
          keyword === STEPS_CHUNK_KEY_STRING
            ? MAX_EMBEDDED_STEPS_BYTES
            : undefined,
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
