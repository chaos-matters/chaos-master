import { BENCHMARK_SAMPLE_SCHEMA_VERSION, createBalancedComparisonSchedule, createSingleCandidateSchedule, } from '@/benchmarks'
import { previewCustomVariation } from '@/flame/variations/custom'
import type { BenchmarkCompilationV1, BenchmarkSampleV1, BenchmarkScheduleEntryV1, } from '@/benchmarks'

export interface BenchmarkRunPreconditions {
  readonly running: boolean
  readonly gpuStatus: string
  readonly hasDevice: boolean
  readonly selectedSourcesCount: number
  readonly customLabEnabled: boolean
  readonly customCompatible: boolean
}

export type BenchmarkRunPreconditionResult =
  | { readonly valid: true }
  | {
      readonly valid: false
      readonly error?: string
      readonly shouldSilentReturn?: boolean
    }

export function validateBenchmarkRunPreconditions(
  params: BenchmarkRunPreconditions,
): BenchmarkRunPreconditionResult {
  if (params.running) {
    return { valid: false, shouldSilentReturn: true }
  }
  if (params.gpuStatus !== 'ready' || !params.hasDevice) {
    return {
      valid: false,
      error: 'A ready WebGPU adapter is required to run local benchmarks.',
    }
  }
  if (params.selectedSourcesCount === 0) {
    return {
      valid: false,
      error: 'Select at least one frozen flame workload.',
    }
  }
  if (params.customLabEnabled && !params.customCompatible) {
    return {
      valid: false,
      error: 'The custom variation lab currently accepts 2D flames only.',
    }
  }
  return { valid: true }
}

export type TransientCustomVariationResult =
  | {
      readonly valid: true
      readonly elapsedMs: number
      readonly transient: { id: string; unregister: () => void }
    }
  | {
      readonly valid: false
      readonly elapsedMs: number
      readonly message: string
    }

export function compileTransientCustomVariation(
  code: string,
): TransientCustomVariationResult {
  const compileStartedAt = globalThis.performance.now()
  const preview = previewCustomVariation(code)
  const elapsedMs = globalThis.performance.now() - compileStartedAt
  if (!preview.valid) {
    return {
      valid: false,
      elapsedMs,
      message: preview.errors.map((error) => error.message).join(' · '),
    }
  }
  return {
    valid: true,
    elapsedMs,
    transient: preview,
  }
}

export function createBenchmarkScheduleForRuntimes(
  runtimes: readonly { candidate: { id: string } }[],
  protocol: { readonly warmupPairs: number; readonly measuredPairs: number },
): readonly BenchmarkScheduleEntryV1[] {
  if (runtimes.length === 2) {
    return createBalancedComparisonSchedule({
      baselineCandidateId: runtimes[0]!.candidate.id,
      candidateId: runtimes[1]!.candidate.id,
      warmupPairs: protocol.warmupPairs,
      measuredPairs: protocol.measuredPairs,
    })
  }
  return createSingleCandidateSchedule({
    candidateId: runtimes[0]!.candidate.id,
    warmupSamples: protocol.warmupPairs,
    measuredSamples: protocol.measuredPairs,
  })
}

export function buildBenchmarkCompilationRecords(
  candidateIds: readonly string[],
  customLabEnabled: boolean,
  compilationElapsedMs: number | null,
): BenchmarkCompilationV1[] {
  return candidateIds.map((candidateId, index) => ({
    candidateId,
    status: 'ready',
    elapsedMs: customLabEnabled && index === 1 ? compilationElapsedMs : null,
    message:
      customLabEnabled && index === 1
        ? 'Safe custom variation transpile/registration only; GPU pipeline warm-up is excluded by the first completed submission.'
        : 'GPU pipeline cold work is excluded by the first completed submission.',
  }))
}

export interface CreateBenchmarkSampleRecordParams {
  readonly entry: BenchmarkScheduleEntryV1
  readonly runId: string
  readonly manifestId: string
  readonly sampleStartedAt: string
  readonly elapsedMs: number
  readonly points: number
  readonly pointsPerSecond: number
  readonly hasSignature: boolean
}

export function createBenchmarkSampleRecord(
  params: CreateBenchmarkSampleRecordParams,
): BenchmarkSampleV1 {
  return {
    schemaVersion: BENCHMARK_SAMPLE_SCHEMA_VERSION,
    id: globalThis.crypto.randomUUID(),
    runId: params.runId,
    manifestId: params.manifestId,
    sequence: params.entry.sequence,
    phase: params.entry.phase,
    pairIndex: params.entry.pairIndex,
    orderInPair: params.entry.orderInPair,
    candidateId: params.entry.candidateId,
    status: 'valid',
    startedAt: params.sampleStartedAt,
    timingMode: 'queue-fenced-wall-clock',
    elapsedMs: params.elapsedMs,
    completedWork: params.points,
    throughput: params.pointsPerSecond,
    invalidReasons: [],
    metadata: {
      blockOrder: params.entry.blockOrder,
      signatureCaptured: params.hasSignature,
    },
  }
}
