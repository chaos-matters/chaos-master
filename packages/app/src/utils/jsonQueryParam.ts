import { validateFlame } from '@/flame/schema/flameSchema'
import { decodeBase64, encodeBase64 } from './base64'
import { recordKeys } from './record'
import { sum } from './sum'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { CustomVariationDef } from '@/flame/variations/custom'
import type { TimelineConfig, TimelineTrack } from '@/utils/timeline'

const format: CompressionFormat = 'deflate'
export const MAX_COMPRESSED_JSON_BYTES = 8 * 1024 * 1024
const DECOMPRESSION_TIMEOUT_MS = 5000

// Verbose share encode/decode/decompress tracing — dev builds only. Vite
// statically replaces `import.meta.env.DEV` with `false` in production and
// strips this to a no-op, so none of these log in prod builds.
const shareLog: (...args: unknown[]) => void = import.meta.env.DEV
  ? (...args) => {
      console.info(...args)
    }
  : () => {}

export function concatBuffers(buffers: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const totalLength = sum(buffers.map((b) => b.length))
  const result = new Uint8Array(totalLength)
  let i = 0
  for (const buffer of buffers) {
    result.set(buffer, i)
    i += buffer.length
  }
  return result
}

export async function compressJsonQueryParam(obj: unknown) {
  const encoder = new TextEncoderStream()
  const compress = new CompressionStream(format)
  const writer = encoder.writable.getWriter()

  encoder.readable.pipeTo(compress.writable).catch(console.error)
  await writer.write(JSON.stringify(obj))
  await writer.close()

  const compressReader = compress.readable.getReader()
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await compressReader.read()
      if (done) {
        break
      }
      chunks.push(value)
    }
  } finally {
    compressReader.releaseLock()
  }
  // TODO: figure out why this works everywhere but not on ios (safari v26)
  // for await (const chunk of compress.readable) {
  //   chunks.push(chunk)
  // }
  return concatBuffers(chunks)
}

export async function encodeJsonQueryParam(obj: unknown) {
  const compressedQuery = await compressJsonQueryParam(obj)
  return encodeBase64(compressedQuery, { pad: '' })
}

export async function decompressJsonQuery(
  compressedBytes: Uint8Array<ArrayBuffer>,
) {
  const decompress = new DecompressionStream(format)
  const decoder = new TextDecoderStream()
  const writer = decompress.writable.getWriter()

  decompress.readable.pipeTo(decoder.writable).catch(console.error)
  await writer.write(compressedBytes)
  await writer.close()

  const decoderReader = decoder.readable.getReader()
  const chunks: string[] = []
  try {
    while (true) {
      const { done, value } = await decoderReader.read()
      if (done) {
        break
      }
      chunks.push(value)
    }
  } finally {
    decoderReader.releaseLock()
  }
  // TODO: figure out why this works everywhere but not on ios (safari v26), in this case
  // the decoder throws 'undefined' is not a function near ...chunk of decoder.readable
  // seems like bug for webkit or device limitation (iPhone 13 PRO)
  // for await (const chunk of decoder.readable) {
  //   chunks.push(chunk)
  // }

  return validateFlame(JSON.parse(chunks.join('')))
}

export async function decodeJsonQueryParam(param: string) {
  return decompressJsonQuery(decodeBase64(param))
}

/**
 * Decompress and JSON-parse, with no assumption about the shape. Separate
 * from {@link decompressJsonPayload} because not every embedded payload is a
 * flame — a PNG also carries the recorded session that produced it, which
 * flame validation would reject.
 */
export async function decompressJsonValue(
  compressedBytes: Uint8Array<ArrayBuffer>,
  maxOutputBytes = 32 * 1024 * 1024,
): Promise<unknown> {
  const rawBytes = await decompressJsonQueryRaw(compressedBytes, maxOutputBytes)
  return JSON.parse(new TextDecoder().decode(rawBytes))
}

/** Validate a decoded payload as a bare FlameDescriptor or SharePayload. */
export function coerceFlamePayload(value: unknown): {
  flame: FlameDescriptor
  animation?: SharePayload['animation']
} {
  const raw = value as Record<string, unknown>
  if (raw && typeof raw === 'object' && 'transforms' in raw) {
    return { flame: validateFlame(raw) }
  }
  if (raw && typeof raw === 'object' && 'flame' in raw) {
    return {
      flame: validateFlame(raw.flame),
      animation: (raw.animation ?? undefined) as SharePayload['animation'],
    }
  }
  throw new Error(
    'Invalid payload: expected flame descriptor or { flame, animation? }',
  )
}

/** Decompress and parse a JSON payload that may be bare FlameDescriptor or SharePayload format. */
export async function decompressJsonPayload(
  compressedBytes: Uint8Array<ArrayBuffer>,
): Promise<{ flame: FlameDescriptor; animation?: SharePayload['animation'] }> {
  return coerceFlamePayload(await decompressJsonValue(compressedBytes))
}

// ── Share payload (flame + optional animation) ──

export interface SharePayload {
  flame: FlameDescriptor
  animation?: {
    tracks: TimelineTrack[]
    config: TimelineConfig
  }
  /**
   * Full definitions of any custom (user-authored WGSL/math) variations the
   * flame references, so the recipient can render them. Untrusted: every entry
   * is re-validated through the allowlist compiler on load — never trusted as-is.
   */
  customVariations?: CustomVariationDef[]
}

export async function encodeSharePayload(
  flame: FlameDescriptor,
  animation?: { tracks: TimelineTrack[]; config: TimelineConfig },
  customVariations?: CustomVariationDef[],
): Promise<string> {
  const payload: SharePayload = { flame }
  if (animation && animation.tracks.length > 0) {
    payload.animation = animation
  }
  if (customVariations && customVariations.length > 0) {
    payload.customVariations = customVariations
  }
  const transformKeys = recordKeys(flame.transforms ?? {})
  const firstColor = transformKeys[0]
    ? (
        flame.transforms as Record<string, { color?: { x: number; y: number } }>
      )[transformKeys[0]]?.color
    : undefined
  shareLog('[share:encode] encoding payload', {
    transformCount: transformKeys.length,
    firstTransformColor: firstColor,
    renderSettings: flame.renderSettings
      ? {
          drawMode: flame.renderSettings.drawMode,
          vibrancy: flame.renderSettings.vibrancy,
        }
      : undefined,
    hasAnimation: !!payload.animation,
    animTrackCount: payload.animation?.tracks.length ?? 0,
  })
  return encodeJsonQueryParam(payload)
}

export async function decodeSharePayload(param: string): Promise<{
  flame: FlameDescriptor
  animation?: SharePayload['animation']
  customVariations?: CustomVariationDef[]
}> {
  shareLog('[share:decode] starting decode, param length:', param.length)
  const rawBytes = decodeBase64(param)
  shareLog(
    '[share:decode] base64 decoded, byte length:',
    rawBytes.length,
    'first 4 hex:',
    Array.from(rawBytes.slice(0, 4))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' '),
  )
  const decompressedBytes = await decompressJsonQueryRaw(rawBytes)
  const rawText = new TextDecoder().decode(decompressedBytes)
  shareLog(
    '[share:decode] decompressed text length:',
    rawText.length,
    'first 100 chars:',
    rawText.slice(0, 100),
  )
  const raw = JSON.parse(rawText)
  // Log raw structure before validation
  const hasTransforms = 'transforms' in raw
  const hasFlame = raw && typeof raw === 'object' && 'flame' in raw
  shareLog('[share:decode] raw structure:', {
    hasTransforms,
    hasFlame,
    hasAnimation: hasFlame && 'animation' in raw,
    topKeys: recordKeys(raw ?? {}),
    rawTransformsCount: hasTransforms
      ? recordKeys(raw.transforms ?? {}).length
      : undefined,
    rawFlameTransformsCount: hasFlame
      ? recordKeys(raw.flame?.transforms ?? {}).length
      : undefined,
    rawFlameFirstColor: hasFlame
      ? (
          Object.values(
            (raw as { flame: Record<string, { color?: unknown }> }).flame
              ?.transforms ?? {},
          )[0] as { color?: unknown } | undefined
        )?.color
      : undefined,
  })
  // Backward compat: old format is bare FlameDescriptor (has `transforms`)
  if (hasTransforms) {
    const validated = validateFlame(raw)
    shareLog(
      '[share:decode] old format, validated flame transforms:',
      recordKeys(validated.transforms).length,
    )
    return { flame: validated }
  }
  // New format: { flame, animation? }
  if (hasFlame) {
    const validated = validateFlame(raw.flame)
    const firstColor = Object.values(validated.transforms ?? {})[0]?.color
    shareLog('[share:decode] new format, validated:', {
      transformCount: recordKeys(validated.transforms).length,
      firstTransformColor: firstColor,
      hasAnimation: !!raw.animation,
      animTrackCount: raw.animation?.tracks?.length ?? 0,
    })
    return {
      flame: validated,
      animation: raw.animation ?? undefined,
      customVariations: Array.isArray(raw.customVariations)
        ? (raw.customVariations as CustomVariationDef[])
        : undefined,
    }
  }
  throw new Error(
    'Invalid share payload: expected flame or { flame, animation? }',
  )
}

/**
 * Decode a single shared custom variation from a `?cv=` link. Returns the raw
 * definition only — it is NOT trusted here. The caller must re-validate it
 * through the allowlist compiler (importSharedVariations) before use.
 */
export async function decodeVariationShare(
  param: string,
): Promise<CustomVariationDef> {
  const decompressed = await decompressJsonQueryRaw(decodeBase64(param))
  const raw = JSON.parse(new TextDecoder().decode(decompressed))
  if (
    raw &&
    typeof raw === 'object' &&
    'variation' in raw &&
    raw.variation &&
    typeof raw.variation === 'object'
  ) {
    return raw.variation as CustomVariationDef
  }
  throw new Error('Invalid shared variation payload')
}

async function decompressJsonQueryRaw(
  compressedBytes: Uint8Array<ArrayBuffer>,
  maxOutputBytes = 32 * 1024 * 1024,
): Promise<Uint8Array> {
  if (compressedBytes.byteLength > MAX_COMPRESSED_JSON_BYTES) {
    throw new Error(
      `Compressed JSON exceeds ${MAX_COMPRESSED_JSON_BYTES} bytes`,
    )
  }
  shareLog('[share:decompress] starting, byte length:', compressedBytes.length)
  const decompress = new DecompressionStream(format)
  shareLog('[share:decompress] DecompressionStream created, format:', format)

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  const abortController = new AbortController()
  const pipeResult = decompress.readable
    .pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          shareLog('[share:decompress] got chunk, size:', chunk.length)
          totalBytes += chunk.byteLength
          if (totalBytes > maxOutputBytes) {
            throw new Error(`Decompressed JSON exceeds ${maxOutputBytes} bytes`)
          }
          chunks.push(chunk)
        },
      }),
      { signal: abortController.signal },
    )
    // Observe the pipe immediately. If the output limit aborts the stream,
    // `writer.write()` and `pipeTo()` can reject in the same turn; waiting to
    // attach a handler until after the writer settles leaves a transient
    // unhandled rejection in browsers and in Vitest.
    .then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }),
    )

  type StreamResult = Awaited<typeof pipeResult>
  const writer = decompress.writable.getWriter()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutError = new Error(
    `Decompression timed out after ${DECOMPRESSION_TIMEOUT_MS / 1000}s`,
  )
  const timeoutResult = new Promise<StreamResult>((resolve) => {
    timeoutId = setTimeout(() => {
      abortController.abort(timeoutError)
      void writer.abort(timeoutError).catch(() => undefined)
      resolve({ ok: false, error: timeoutError })
    }, DECOMPRESSION_TIMEOUT_MS)
  })
  const writeResult = (async (): Promise<StreamResult> => {
    try {
      await writer.write(compressedBytes)
      shareLog('[share:decompress] wrote', compressedBytes.length, 'bytes')
      await writer.close()
      shareLog('[share:decompress] writer closed')
      return { ok: true }
    } catch (error) {
      return { ok: false, error }
    }
  })()
  // Fail as soon as either half fails, but only report success once BOTH the
  // input writer and decompressed output pipe have completed.
  const streamResult = Promise.race([
    pipeResult.then((result) => (result.ok ? writeResult : result)),
    writeResult.then((result) => (result.ok ? pipeResult : result)),
  ])
  const result = await Promise.race([streamResult, timeoutResult])
  if (timeoutId !== undefined) clearTimeout(timeoutId)
  if (!result.ok) {
    abortController.abort(result.error)
    void writer.abort(result.error).catch(() => undefined)
    throw result.error
  }
  shareLog(
    '[share:decompress] decompression success, chunks:',
    chunks.length,
    'total bytes:',
    totalBytes,
  )
  return concatBuffers(chunks)
}
