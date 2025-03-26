const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

// Use a lookup table to find the index.
const lookup = new Uint8Array(256)
for (let i = 0; i < chars.length; i++) {
  lookup[chars.charCodeAt(i)] = i
}

type EncodeBase64Options = {
  pad?: string
}

export function encodeBase64(
  bytes: Uint8Array,
  { pad = '=' }: EncodeBase64Options = {},
): string {
  let base64 = ''

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]!
    const c = bytes[i + 2]!
    base64 += chars[a >> 2]!
    base64 += chars[((a & 3) << 4) | (b >> 4)]!
    base64 += chars[((b & 15) << 2) | (c >> 6)]!
    base64 += chars[c & 63]!
  }

  if (bytes.length % 3 === 2) {
    base64 = base64.substring(0, base64.length - 1) + pad
  } else if (bytes.length % 3 === 1) {
    base64 = base64.substring(0, base64.length - 2) + pad + pad
  }

  return base64
}

export function decodeBase64(base64: string): Uint8Array {
  let bufferLength = (base64.length * 3) / 4

  if (base64.at(-1) === '=') {
    bufferLength--
    if (base64.at(-2) === '=') {
      bufferLength--
    }
  }

  const bytes = new Uint8Array(bufferLength)

  let p = 0
  for (let i = 0; i < base64.length; i += 4) {
    const encoded1 = lookup[base64.charCodeAt(i)]!
    const encoded2 = lookup[base64.charCodeAt(i + 1)]!
    const encoded3 = lookup[base64.charCodeAt(i + 2)]!
    const encoded4 = lookup[base64.charCodeAt(i + 3)]!

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4)
    bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2)
    bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63)
  }

  return bytes
}
