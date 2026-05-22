import { validateFlame } from '@/flame/schema/flameSchema'
import { decodeBase64, encodeBase64 } from './base64'
import { sum } from './sum'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineConfig, TimelineTrack } from '@/utils/timeline'

const format: CompressionFormat = 'deflate'

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
  const chunks = []
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
  const chunks = []
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

  return validateFlame(JSON.parse(chunks.join()))
}

export async function decodeJsonQueryParam(param: string) {
  return decompressJsonQuery(decodeBase64(param))
}

/** Decompress and parse a JSON payload that may be bare FlameDescriptor or SharePayload format. */
export async function decompressJsonPayload(
  compressedBytes: Uint8Array<ArrayBuffer>,
): Promise<{ flame: FlameDescriptor; animation?: SharePayload['animation'] }> {
  const rawBytes = await decompressJsonQueryRaw(compressedBytes)
  const rawText = new TextDecoder().decode(rawBytes)
  const raw = JSON.parse(rawText)
  if ('transforms' in raw) {
    return { flame: validateFlame(raw) }
  }
  if (raw && typeof raw === 'object' && 'flame' in raw) {
    return {
      flame: validateFlame(raw.flame),
      animation: raw.animation ?? undefined,
    }
  }
  throw new Error(
    'Invalid payload: expected flame descriptor or { flame, animation? }',
  )
}

// ── Share payload (flame + optional animation) ──

export interface SharePayload {
  flame: FlameDescriptor
  animation?: {
    tracks: TimelineTrack[]
    config: TimelineConfig
  }
}

export async function encodeSharePayload(
  flame: FlameDescriptor,
  animation?: { tracks: TimelineTrack[]; config: TimelineConfig },
): Promise<string> {
  const payload: SharePayload = { flame }
  if (animation && animation.tracks.length > 0) {
    payload.animation = animation
  }
  const transformKeys = Object.keys(flame.transforms ?? {})
  const firstColor = transformKeys[0]
    ? (
        flame.transforms as Record<string, { color?: { x: number; y: number } }>
      )[transformKeys[0]]?.color
    : undefined
  console.info('[share:encode] encoding payload', {
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

export async function decodeSharePayload(
  param: string,
): Promise<{ flame: FlameDescriptor; animation?: SharePayload['animation'] }> {
  console.info('[share:decode] starting decode, param length:', param.length)
  const rawBytes = decodeBase64(param)
  console.info(
    '[share:decode] base64 decoded, byte length:',
    rawBytes.length,
    'first 4 hex:',
    Array.from(rawBytes.slice(0, 4))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' '),
  )
  const decompressedBytes = await decompressJsonQueryRaw(rawBytes)
  const rawText = new TextDecoder().decode(decompressedBytes)
  console.info(
    '[share:decode] decompressed text length:',
    rawText.length,
    'first 100 chars:',
    rawText.slice(0, 100),
  )
  const raw = JSON.parse(rawText)
  // Log raw structure before validation
  const hasTransforms = 'transforms' in raw
  const hasFlame = raw && typeof raw === 'object' && 'flame' in raw
  console.info('[share:decode] raw structure:', {
    hasTransforms,
    hasFlame,
    hasAnimation: hasFlame && 'animation' in raw,
    topKeys: Object.keys(raw ?? {}),
    rawTransformsCount: hasTransforms
      ? Object.keys(raw.transforms ?? {}).length
      : undefined,
    rawFlameTransformsCount: hasFlame
      ? Object.keys(raw.flame?.transforms ?? {}).length
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
    console.info(
      '[share:decode] old format, validated flame transforms:',
      Object.keys(validated.transforms).length,
    )
    return { flame: validated }
  }
  // New format: { flame, animation? }
  if (hasFlame) {
    const validated = validateFlame(raw.flame)
    const firstColor = Object.values(validated.transforms ?? {})[0]?.color
    console.info('[share:decode] new format, validated:', {
      transformCount: Object.keys(validated.transforms).length,
      firstTransformColor: firstColor,
      hasAnimation: !!raw.animation,
      animTrackCount: raw.animation?.tracks?.length ?? 0,
    })
    return {
      flame: validated,
      animation: raw.animation ?? undefined,
    }
  }
  throw new Error(
    'Invalid share payload: expected flame or { flame, animation? }',
  )
}

async function decompressJsonQueryRaw(
  compressedBytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  console.info(
    '[share:decompress] starting, byte length:',
    compressedBytes.length,
  )
  const decompress = new DecompressionStream(format)
  console.info(
    '[share:decompress] DecompressionStream created, format:',
    format,
  )

  const chunks: Uint8Array[] = []
  const pipePromise = decompress.readable.pipeTo(
    new WritableStream<Uint8Array>({
      write(chunk) {
        console.info('[share:decompress] got chunk, size:', chunk.length)
        chunks.push(chunk)
      },
    }),
  )

  const writer = decompress.writable.getWriter()
  await writer.write(compressedBytes)
  console.info('[share:decompress] wrote', compressedBytes.length, 'bytes')
  await writer.close()
  console.info('[share:decompress] writer closed')

  await Promise.race([
    pipePromise,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        reject(new Error('Decompression timed out after 5s'))
      }, 5000),
    ),
  ])
  console.info(
    '[share:decompress] decompression success, chunks:',
    chunks.length,
    'total bytes:',
    chunks.reduce((s, c) => s + c.length, 0),
  )
  return concatBuffers(chunks)
}
