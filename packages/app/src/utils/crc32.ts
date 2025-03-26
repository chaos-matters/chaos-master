const crc32TableSize = 256
const crcPolynomial = 0xedb88320
const initialCrcValue = 0xffffffff
let crc32Table: Uint32Array | undefined = undefined

function convertNumToUint32(num: number): number {
  return num >>> 0 // allegedly converts a number into unsigned integer
}

function getCRC32Table(): Uint32Array {
  if (crc32Table !== undefined) {
    return crc32Table
  }
  crc32Table = new Uint32Array(crc32TableSize)
  for (let n = 0; n < crc32TableSize; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? crcPolynomial ^ (c >>> 1) : c >>> 1
    }
    crc32Table[n] = convertNumToUint32(c)
  }
  return crc32Table
}

export function calculateCRC32(buffer: Uint8Array): number {
  let crc = initialCrcValue
  const lookupTable = getCRC32Table()
  for (const byte of buffer) {
    const tableIndex = (crc ^ byte) & 0xff
    const tableLookup = lookupTable[tableIndex]
    if (tableLookup === undefined) {
      throw new Error('CRC lookup table index out of range!')
    }
    crc = tableLookup ^ (crc >>> 8)
  }
  return convertNumToUint32(crc ^ initialCrcValue)
}
