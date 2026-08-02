import { isFlameXmlContent, parseFlameXmlWithReport } from '@/flame/flameXml'
import { extractFlameFromPng } from '@/utils/flameInPng'
import { createBenchmarkFlameSource } from './flameSources'
import type { BenchmarkFlameSourceDescriptor } from './flameSources'
import type { SharePayload } from '@/utils/jsonQueryParam'

export const MAX_BENCHMARK_UPLOAD_SIZE = 500 * 1024 * 1024

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

export type BenchmarkUploadErrorCode =
  | 'invalid-png'
  | 'invalid-xml'
  | 'read-failed'
  | 'too-large'
  | 'unsupported-format'

export class BenchmarkUploadError extends Error {
  readonly code: BenchmarkUploadErrorCode

  constructor(
    code: BenchmarkUploadErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'BenchmarkUploadError'
    this.code = code
  }
}

export interface BenchmarkUploadFile {
  readonly name: string
  readonly size: number
  readonly type?: string
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface BenchmarkFlameUploadResult {
  readonly format: 'flame-xml' | 'png'
  readonly source: BenchmarkFlameSourceDescriptor
  readonly warnings: readonly string[]
  readonly animation?: SharePayload['animation']
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  )
}

function fileStem(name: string): string {
  const lastSegment = name.split(/[\\/]/).at(-1) ?? name
  return lastSegment.replace(/\.(?:flame|png|xml)$/i, '') || 'Uploaded flame'
}

function uploadLabel(name: string, metadataName: string | undefined): string {
  const trimmedMetadataName = metadataName?.trim()
  return trimmedMetadataName && trimmedMetadataName !== 'Imported Flame'
    ? trimmedMetadataName
    : fileStem(name)
}

/**
 * Parses a benchmark flame without touching editor state or registering an
 * embedded XML palette. XML colors are baked into the returned descriptor by
 * parseFlameXmlWithReport; PNG metadata extraction is likewise read-only.
 */
export async function parseBenchmarkFlameUpload(
  file: BenchmarkUploadFile,
): Promise<BenchmarkFlameUploadResult> {
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    throw new BenchmarkUploadError(
      'read-failed',
      'Upload size is not a valid non-negative integer',
    )
  }
  if (file.size > MAX_BENCHMARK_UPLOAD_SIZE) {
    throw new BenchmarkUploadError(
      'too-large',
      `'${file.name}' exceeds the ${Math.floor(
        MAX_BENCHMARK_UPLOAD_SIZE / (1024 * 1024),
      )} MiB benchmark upload limit`,
    )
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch (cause) {
    throw new BenchmarkUploadError(
      'read-failed',
      `Could not read '${file.name}'`,
      { cause },
    )
  }

  if (hasPngSignature(bytes)) {
    try {
      const parsed = await extractFlameFromPng(bytes)
      return {
        format: 'png',
        source: createBenchmarkFlameSource(parsed.flame, {
          label: uploadLabel(file.name, parsed.flame.metadata?.name),
          source: 'upload',
          provenance: { sourceKey: file.name },
        }),
        warnings: [],
        ...(parsed.animation === undefined
          ? {}
          : { animation: parsed.animation }),
      }
    } catch (cause) {
      throw new BenchmarkUploadError(
        'invalid-png',
        `No valid flame metadata was found in '${file.name}'`,
        { cause },
      )
    }
  }

  const text = new TextDecoder().decode(bytes)
  if (isFlameXmlContent(text)) {
    try {
      const parsed = parseFlameXmlWithReport(text)
      return {
        format: 'flame-xml',
        source: createBenchmarkFlameSource(parsed.flame, {
          label: uploadLabel(file.name, parsed.flame.metadata?.name),
          source: 'upload',
          provenance: { sourceKey: file.name },
        }),
        warnings: parsed.warnings,
      }
    } catch (cause) {
      throw new BenchmarkUploadError(
        'invalid-xml',
        `Could not parse '${file.name}' as a flame XML file`,
        { cause },
      )
    }
  }

  const looksLikePng =
    file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
  if (looksLikePng) {
    throw new BenchmarkUploadError(
      'invalid-png',
      `'${file.name}' does not have a valid PNG signature`,
    )
  }
  throw new BenchmarkUploadError(
    'unsupported-format',
    `'${file.name}' is not a supported flame XML or PNG file`,
  )
}
