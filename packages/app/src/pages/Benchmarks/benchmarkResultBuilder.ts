import { BENCHMARK_RESULT_SCHEMA_VERSION, deriveBenchmarkCandidateSummaries, deriveBenchmarkComparison, validateBenchmarkResult, } from '@/benchmarks'
import type { BenchmarkCompilationV1, BenchmarkCorrectnessStatus, BenchmarkManifestV1, BenchmarkResultV1, BenchmarkSampleV1, } from '@/benchmarks'

export interface BuildBenchmarkResultParams {
  readonly resultId: string
  readonly manifest: BenchmarkManifestV1
  readonly samples: readonly BenchmarkSampleV1[]
  readonly compilation: readonly BenchmarkCompilationV1[]
  readonly signatures: ReadonlyMap<string, readonly (readonly number[])[]>
  readonly startedAt: string
  readonly adapter?: GPUAdapter | null
  readonly device?: GPUDevice | null
  readonly customLabEnabled?: boolean
}

export function signatureLooksRendered(
  signatures: readonly (readonly number[])[],
): boolean {
  if (signatures.length === 0) return false
  return signatures.some((signature) => {
    const lit = signature.filter((value) => value > 1).length
    const max = Math.max(...signature)
    return lit >= 2 && max > 4
  })
}

export function evaluateComparisonSignatures(
  manifest: BenchmarkManifestV1,
  signatures: ReadonlyMap<string, readonly (readonly number[])[]>,
): BenchmarkCorrectnessStatus {
  if (manifest.mode !== 'comparison') {
    return 'not-checked'
  }
  const [baseline, candidate] = manifest.candidates
  const baselineSignatures = signatures.get(baseline.id) ?? []
  const candidateSignatures = signatures.get(candidate.id) ?? []
  const signaturesAvailable =
    baselineSignatures.length > 0 && candidateSignatures.length > 0

  if (!signaturesAvailable) {
    return 'not-checked'
  }
  return signatureLooksRendered(baselineSignatures) &&
    signatureLooksRendered(candidateSignatures)
    ? 'passed'
    : 'failed'
}

export function buildBenchmarkDeviceReport(
  adapter?: GPUAdapter | null,
  device?: GPUDevice | null,
): BenchmarkResultV1['device'] {
  const info = adapter?.info
  return {
    adapter: info?.description || info?.vendor || 'WebGPU adapter',
    ...(info?.architecture ? { architecture: info.architecture } : {}),
    ...(info?.vendor ? { vendor: info.vendor } : {}),
    browser: globalThis.navigator.userAgent,
    features: device ? [...device.features].sort() : [],
    metadata: {
      maxBufferSize: device?.limits.maxBufferSize ?? 0,
      hardwareConcurrency: globalThis.navigator.hardwareConcurrency,
    },
  }
}

export function resolveBenchmarkMetadata(
  manifest: BenchmarkManifestV1,
  customLabEnabled = false,
): BenchmarkResultV1['metadata'] {
  const isComparison = manifest.mode === 'comparison'
  return {
    runner: 'lab-v1',
    correctnessMethod: isComparison
      ? 'nonblank-render-smoke/v1'
      : 'not-checked',
    correctnessScope: customLabEnabled
      ? 'safe-compile-and-nonblank-render-smoke'
      : isComparison
        ? 'nonblank-render-smoke'
        : 'not-checked',
  }
}

export function buildBenchmarkResult(
  params: BuildBenchmarkResultParams,
): BenchmarkResultV1 {
  const {
    resultId,
    manifest,
    samples,
    compilation,
    signatures,
    startedAt,
    adapter,
    device,
    customLabEnabled = false,
  } = params

  const candidates = deriveBenchmarkCandidateSummaries(manifest, samples)
  let comparison: BenchmarkResultV1['comparison']
  if (manifest.mode === 'comparison') {
    const correctness = evaluateComparisonSignatures(manifest, signatures)
    comparison = deriveBenchmarkComparison(manifest, samples, { correctness })
  }

  const preliminary: BenchmarkResultV1 = {
    schemaVersion: BENCHMARK_RESULT_SCHEMA_VERSION,
    id: resultId,
    manifestId: manifest.id,
    status: 'completed',
    startedAt,
    completedAt: new Date().toISOString(),
    device: buildBenchmarkDeviceReport(adapter, device),
    compilation,
    samples,
    candidates,
    ...(comparison ? { comparison } : {}),
    validation: { status: 'valid', issues: [] },
    metadata: resolveBenchmarkMetadata(manifest, customLabEnabled),
  }

  const validation = validateBenchmarkResult(preliminary, manifest)
  return {
    ...preliminary,
    status: validation.status === 'invalid' ? 'invalid' : 'completed',
    validation,
  }
}
