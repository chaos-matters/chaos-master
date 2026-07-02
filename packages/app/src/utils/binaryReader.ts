/**
 * Small big-endian byte helpers shared by the PNG (zTXt chunk) and MP4 (box)
 * metadata (de)serializers. Both hand-walk a binary container, reading 4-byte
 * lengths and 4-character ASCII type tags and writing back big-endian sizes.
 */

/** Serialize a 32-bit unsigned integer as 4 big-endian bytes. */
export function writeUint32BE(value: number): Uint8Array {
  const buffer = new ArrayBuffer(4)
  new DataView(buffer).setUint32(0, value)
  return new Uint8Array(buffer)
}

/** Read a 32-bit big-endian unsigned integer from a DataView. */
export function readUint32BE(view: DataView, offset: number): number {
  return view.getUint32(offset)
}

/** Encode an ASCII / Latin-1 string to bytes. */
export function asciiBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

/** Read a fixed-length ASCII / Latin-1 string from a DataView. */
export function readAscii(
  view: DataView,
  offset: number,
  length: number,
): string {
  let s = ''
  for (let i = 0; i < length; i++) {
    s += String.fromCharCode(view.getUint8(offset + i))
  }
  return s
}

/** Read a fixed-length ASCII / Latin-1 string from a byte array. */
export function readAsciiBytes(
  bytes: Uint8Array,
  offset: number,
  length: number,
): string {
  let s = ''
  for (let i = 0; i < length; i++) {
    s += String.fromCharCode(bytes[offset + i]!)
  }
  return s
}
