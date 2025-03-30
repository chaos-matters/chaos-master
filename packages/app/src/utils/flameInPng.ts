import { calculateCRC32 } from './crc32'
import { concatBuffers, decompressJsonQuery } from './jsonQueryParam'

const PNG_HEADER_SIZE_IN_BYTES = 8
const CHUNK_KEY_STRING = 'FlameJson'
const CHUNK_TYPE_SIZE_IN_BYTES = 4
const CHUNK_LENGTH_SIZE_IN_BYTES = 4
const CHUNK_CRC_SIZE_IN_BYTES = 4
const CHUNK_KEY_SIZE_IN_BYTES = CHUNK_KEY_STRING.length
const CHUNK_KEY_END_SIZE_IN_BYTES = 1
const CHUNK_COMPRESSION_SIZE_IN_BYTES = 1
const CHUNK_COMPRESSION_DEFLATE = 0x00
const CHUNK_HEADER_SIZE_IN_BYTES =
  CHUNK_LENGTH_SIZE_IN_BYTES + CHUNK_TYPE_SIZE_IN_BYTES
// zTXt type specifies compressed PNG Latin-1 text
const ztxtTypeBytes = new Uint8Array([0x7a, 0x54, 0x58, 0x74])
// convert key to ASCII and add null separator
const keywordBytes = new TextEncoder().encode(`${CHUNK_KEY_STRING}\0`)
// compression method (0 for deflate)
const compressionMethod = new Uint8Array([CHUNK_COMPRESSION_DEFLATE])

function getUint32ValueInArrayBuffer(value: number) {
  const buffer = new ArrayBuffer(4)
  const dv = new DataView(buffer)
  dv.setUint32(0, value)
  return new Uint8Array(buffer)
}

function insertZtxtChunk(
  imageData: Uint8Array,
  encodedDataBytes: Uint8Array,
): Uint8Array {
  // construct zTXt chunk data: [keywordBytes] + [compressionMethod] + [encodedData]
  const ztxtChunkData = concatBuffers([
    keywordBytes,
    compressionMethod,
    encodedDataBytes,
  ])

  // calculate CRC32 on all chunk bytes except length
  const chunkCRC = calculateCRC32(concatBuffers([ztxtTypeBytes, ztxtChunkData]))
  // create zTXt chunk: [Length] + [Type] + [Data] + [CRC]
  const chunkLength = getUint32ValueInArrayBuffer(ztxtChunkData.length)
  const chunkCRCBytes = getUint32ValueInArrayBuffer(chunkCRC)
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
    const chunkType = String.fromCharCode(
      ...imageData.slice(
        imagePos + CHUNK_LENGTH_SIZE_IN_BYTES,
        imagePos + CHUNK_LENGTH_SIZE_IN_BYTES + CHUNK_TYPE_SIZE_IN_BYTES,
      ),
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
) {
  const chunkTypePos = chunkPos + CHUNK_LENGTH_SIZE_IN_BYTES
  const chunkData = imageData.subarray(
    chunkTypePos,
    chunkTypePos + CHUNK_TYPE_SIZE_IN_BYTES + chunkLength,
  )
  const chunkDataPos = chunkTypePos + CHUNK_TYPE_SIZE_IN_BYTES
  // index of \0, keyword should not have 0 value according to spec
  const separatorByteIdx = chunkData.indexOf(0)
  const crcIdx = chunkDataPos + chunkLength
  const crcData = imageData.slice(crcIdx, crcIdx + CHUNK_CRC_SIZE_IN_BYTES)
  const readCrc = new DataView(crcData.buffer).getUint32(0)
  // crc is calculated on all chunk segments except for length (first one)
  const calculatedCrc = calculateCRC32(chunkData)
  if (readCrc !== calculatedCrc) {
    throw new Error(`CRC mismatch: PNG: [${readCrc}] ::  [${calculatedCrc}]`)
  }
  if (
    separatorByteIdx === -1 &&
    chunkData[separatorByteIdx + 1] !== CHUNK_COMPRESSION_DEFLATE
  ) {
    throw new Error(
      `Compression type is invalid. Please use type: ${CHUNK_COMPRESSION_DEFLATE}`,
    )
  }

  const compressedData = chunkData.slice(
    CHUNK_TYPE_SIZE_IN_BYTES +
      CHUNK_KEY_SIZE_IN_BYTES +
      CHUNK_KEY_END_SIZE_IN_BYTES +
      CHUNK_COMPRESSION_SIZE_IN_BYTES,
  )
  return await decompressJsonQuery(compressedData)
}

export async function extractFlameFromPng(imageData: Uint8Array) {
  let imagePos = PNG_HEADER_SIZE_IN_BYTES
  while (imagePos < imageData.length) {
    const chunkLength = new DataView(imageData.buffer).getUint32(imagePos)
    const chunkType = String.fromCharCode(
      ...imageData.slice(
        imagePos + CHUNK_LENGTH_SIZE_IN_BYTES,
        imagePos + CHUNK_LENGTH_SIZE_IN_BYTES + CHUNK_TYPE_SIZE_IN_BYTES,
      ),
    )
    if (chunkType === 'zTXt') {
      const chunkKeyword = String.fromCharCode(
        ...imageData.slice(
          imagePos + CHUNK_HEADER_SIZE_IN_BYTES,
          imagePos + CHUNK_HEADER_SIZE_IN_BYTES + CHUNK_KEY_SIZE_IN_BYTES,
        ),
      )
      // we expect only our zTXt chunks, rest are ignored, so multiple compressed texts can be added
      if (chunkKeyword === CHUNK_KEY_STRING) {
        return readZtxtChunk(imagePos, chunkLength, imageData)
      }
    }

    imagePos +=
      CHUNK_LENGTH_SIZE_IN_BYTES +
      CHUNK_TYPE_SIZE_IN_BYTES +
      chunkLength +
      CHUNK_CRC_SIZE_IN_BYTES
  }
  throw new Error('Cannot find flame data. ')
}

export function addFlameDataToPng(
  flameData: Uint8Array,
  imageData: Uint8Array,
): Blob {
  const newImageData = insertZtxtChunk(imageData, flameData)
  return new Blob([newImageData], { type: 'image/png' })
}
