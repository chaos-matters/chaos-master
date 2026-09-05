export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * JSON with an edge/browser cache window. Used by the gallery reads, whose
 * content only changes when rows are rewritten by hand — `stale-while-
 * revalidate` keeps Home fast right after an edit without serving a stale
 * response for long.
 */
export function jsonCached(data: unknown, seconds: number): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${seconds}, stale-while-revalidate=${seconds * 4}`,
    },
  })
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i)
  }
  return bytes
}

// Reduce a thrown value to a log-safe message. Avoids dumping full Error objects
// (and any request/upstream detail they may carry) into log retention.
export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function generateShortId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  const array = new Uint8Array(8)
  globalThis.crypto.getRandomValues(array)
  for (let i = 0; i < array.length; i++) {
    id += chars.charAt(array[i]! % chars.length)
  }
  return id
}

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function pngDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | undefined {
  // PNG signature (8), IHDR length/type (8), then width/height (8).
  if (bytes.length < 24) return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (
    signature.some((byte, index) => bytes[index] !== byte) ||
    view.getUint32(8) !== 13 ||
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) {
    return undefined
  }
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (width < 1 || height < 1 || width > 8192 || height > 8192) {
    return undefined
  }
  return { width, height }
}

export function slugWord(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36)
}
