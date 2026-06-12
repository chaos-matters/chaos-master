/**
 * Minimal ICO encoder packing multiple PNG frames into a .ico file.
 *
 * ICO binary layout:
 *   Header:   reserved(2)=0  type(2)=1  count(2)=N
 *   Entries:  N × [width(1) height(1) palette(1)=0 reserved(1)=0
 *                  planes(2)=1 bpp(2)=32 size(4) offset(4)]
 *   Data:     concatenated PNG blobs at their declared offsets
 *
 * Width/height are 1-byte each; 0 means 256.
 */
export interface IcoFrame {
  width: number
  height: number
  png: Uint8Array
}

export function encodeIco(frames: IcoFrame[]): Blob {
  const count = frames.length
  const headerSize = 6
  const entrySize = 16
  const directorySize = headerSize + count * entrySize

  // Calculate offsets for each PNG blob
  const offsets: number[] = []
  let offset = directorySize
  for (const frame of frames) {
    offsets.push(offset)
    offset += frame.png.byteLength
  }

  const buf = new ArrayBuffer(offset)
  const view = new DataView(buf)
  let pos = 0

  // Header
  view.setUint16(pos, 0, true) // reserved
  pos += 2
  view.setUint16(pos, 1, true) // type: ICO
  pos += 2
  view.setUint16(pos, count, true) // image count
  pos += 2

  // Directory entries
  for (let i = 0; i < count; i++) {
    const { width, height, png } = frames[i]!
    view.setUint8(pos, width >= 256 ? 0 : width)
    pos += 1
    view.setUint8(pos, height >= 256 ? 0 : height)
    pos += 1
    view.setUint8(pos, 0) // palette size
    pos += 1
    view.setUint8(pos, 0) // reserved
    pos += 1
    view.setUint16(pos, 1, true) // planes (always 1 for PNG-in-ICO)
    pos += 2
    view.setUint16(pos, 32, true) // bpp
    pos += 2
    view.setUint32(pos, png.byteLength, true) // size
    pos += 4
    view.setUint32(pos, offsets[i], true) // offset
    pos += 4
  }

  // Write PNG data at each offset
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < count; i++) {
    bytes.set(frames[i]!.png, offsets[i])
  }

  return new Blob([bytes], { type: 'image/x-icon' })
}
