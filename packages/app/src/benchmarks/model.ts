export const BENCHMARK_MANIFEST_SCHEMA_VERSION =
  'chaos-benchmark-manifest/v1' as const
export const BENCHMARK_SAMPLE_SCHEMA_VERSION =
  'chaos-benchmark-sample/v1' as const
export const BENCHMARK_RESULT_SCHEMA_VERSION =
  'chaos-benchmark-result/v1' as const

export type JsonPrimitive = boolean | number | string | null
export type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[]
export type JsonObject = Readonly<Record<string, JsonValue>>

export type BenchmarkMode = 'comparison' | 'single'
export type BenchmarkPhase = 'measured' | 'warmup'
export type BenchmarkTimingMode = 'gpu-timestamp' | 'queue-fenced-wall-clock'
export type BenchmarkMetricDirection = 'higher-is-better' | 'lower-is-better'

export type BenchmarkRunStatus =
  | 'cancelled'
  | 'completed'
  | 'failed'
  | 'invalid'
  | 'preparing'
  | 'queued'
  | 'running'
  | 'warming-up'

export type BenchmarkSampleStatus = 'invalid' | 'valid'
export type BenchmarkCompilationStatus = 'failed' | 'ready'
export type BenchmarkValidationStatus = 'invalid' | 'valid' | 'warning'
export type BenchmarkCorrectnessStatus = 'failed' | 'not-checked' | 'passed'
export type BenchmarkComparisonVerdict =
  | 'equivalent'
  | 'faster'
  | 'inconclusive'
  | 'insufficient-data'
  | 'invalid'
  | 'slower'

export type BenchmarkInvalidReason =
  | 'cancelled'
  | 'correctness-failed'
  | 'device-lost'
  | 'hidden-tab'
  | 'non-finite-metric'
  | 'protocol-violation'
  | 'queue-error'
  | 'saturation'
  | 'thermal-drift'
  | 'timing-unavailable'
  | 'unknown'

export interface BenchmarkMetricV1 {
  readonly id: string
  readonly label: string
  readonly unit: string
  readonly direction: BenchmarkMetricDirection
}

export interface BenchmarkEnvironmentV1 {
  readonly kind: 'local-webgpu' | 'server-webgpu'
  /**
   * Identifies a concrete remote worker pool or the local browser executor.
   * It is intentionally opaque so a future server executor does not change
   * the manifest schema.
   */
  readonly executorId: string
  readonly requestedFeatures: readonly string[]
  readonly metadata: JsonObject
}

export interface BenchmarkFlameV1 {
  readonly id: string
  readonly label: string
  readonly source:
    | 'builtin'
    | 'gallery'
    | 'generated'
    | 'recent'
    | 'synthetic'
    | 'upload'
  /**
   * Digest of the canonical serialized flame. The optional snapshot makes an
   * exported manifest self-contained while the digest keeps comparisons cheap.
   */
  readonly digest: string
  readonly snapshot?: JsonValue
}

export interface BenchmarkWorkloadV1 {
  readonly id: string
  readonly label: string
  readonly flame: BenchmarkFlameV1
  readonly width: number
  readonly height: number
  readonly pointCount: number
  readonly deterministicSeed: number
  readonly settings: JsonObject
}

export interface BenchmarkImplementationV1 {
  readonly kind:
    | 'point-initializer'
    | 'renderer'
    | 'reconstruction'
    | 'rng'
    | 'variation'
  readonly id: string
  readonly label: string
  /**
   * Source or build digest. It prevents two identically named candidates from
   * being treated as the same implementation in exported results.
   */
  readonly digest?: string
  readonly settings: JsonObject
}

export interface BenchmarkCandidateV1 {
  readonly id: string
  readonly label: string
  readonly role: 'baseline' | 'candidate'
  readonly implementations: readonly BenchmarkImplementationV1[]
  readonly metadata: JsonObject
}

export type BenchmarkWorkBudgetV1 =
  | {
      readonly kind: 'fixed-duration'
      readonly durationMs: number
    }
  | {
      readonly kind: 'fixed-work'
      readonly workUnits: number
    }
  | {
      /**
       * Continue until both minimums have been reached. This describes the
       * local lab runner truthfully: a fast adapter cannot finish before the
       * stability window, and a slow adapter must still complete enough work.
       */
      readonly kind: 'minimum-work-and-duration'
      readonly workUnits: number
      readonly durationMs: number
    }

export interface BenchmarkProtocolV1 {
  readonly id: string
  readonly timingMode: BenchmarkTimingMode
  readonly warmupPairs: number
  readonly measuredPairs: number
  readonly workBudget: BenchmarkWorkBudgetV1
  readonly metric: BenchmarkMetricV1
  /**
   * Compile/setup cost is kept outside steady-state samples. A consumer may
   * still display it, but it must not be folded into throughput.
   */
  readonly compilation: 'reported-separately'
}

export type BenchmarkBlockOrder = 'AB' | 'BA'

export interface BenchmarkScheduleEntryV1 {
  readonly sequence: number
  readonly phase: BenchmarkPhase
  readonly pairIndex: number
  readonly orderInPair: 0 | 1
  readonly blockOrder: BenchmarkBlockOrder
  readonly candidateId: string
}

interface BenchmarkManifestBaseV1 {
  readonly schemaVersion: typeof BENCHMARK_MANIFEST_SCHEMA_VERSION
  readonly id: string
  readonly createdAt: string
  readonly appVersion: string
  readonly buildId: string
  readonly environment: BenchmarkEnvironmentV1
  readonly protocol: BenchmarkProtocolV1
  readonly workload: BenchmarkWorkloadV1
  readonly schedule: readonly BenchmarkScheduleEntryV1[]
  readonly metadata: JsonObject
}

export interface SingleBenchmarkManifestV1 extends BenchmarkManifestBaseV1 {
  readonly mode: 'single'
  readonly candidates: readonly [BenchmarkCandidateV1]
}

export interface ComparisonBenchmarkManifestV1 extends BenchmarkManifestBaseV1 {
  readonly mode: 'comparison'
  readonly candidates: readonly [BenchmarkCandidateV1, BenchmarkCandidateV1]
}

export type BenchmarkManifestV1 =
  | ComparisonBenchmarkManifestV1
  | SingleBenchmarkManifestV1

export interface BenchmarkDeviceSnapshotV1 {
  readonly adapter: string
  readonly architecture?: string
  readonly vendor?: string
  readonly browser?: string
  readonly features: readonly string[]
  readonly metadata: JsonObject
}

export interface BenchmarkSampleV1 {
  readonly schemaVersion: typeof BENCHMARK_SAMPLE_SCHEMA_VERSION
  readonly id: string
  readonly runId: string
  readonly manifestId: string
  readonly sequence: number
  readonly phase: BenchmarkPhase
  readonly pairIndex: number
  readonly orderInPair: 0 | 1
  readonly candidateId: string
  readonly status: BenchmarkSampleStatus
  readonly startedAt: string
  readonly timingMode: BenchmarkTimingMode
  readonly elapsedMs: number | null
  readonly completedWork: number | null
  readonly throughput: number | null
  readonly invalidReasons: readonly BenchmarkInvalidReason[]
  readonly metadata: JsonObject
}

export interface BenchmarkConfidenceIntervalV1 {
  readonly level: number
  readonly low: number
  readonly high: number
  readonly method: 'deterministic-percentile-bootstrap'
  readonly resamples: number
  readonly seed: number
}

export interface BenchmarkDistributionSummaryV1 {
  readonly count: number
  readonly min: number
  readonly max: number
  readonly mean: number
  readonly median: number
  readonly p10: number
  readonly p90: number
  readonly mad: number
  /**
   * Sample coefficient of variation. Undefined for a single observation or a
   * zero mean.
   */
  readonly cv?: number
  readonly confidenceInterval: BenchmarkConfidenceIntervalV1
}

export interface BenchmarkCandidateSummaryV1 {
  readonly candidateId: string
  readonly validSampleCount: number
  readonly invalidSampleCount: number
  readonly throughput?: BenchmarkDistributionSummaryV1
}

export interface BenchmarkComparisonSummaryV1 {
  readonly baselineCandidateId: string
  readonly candidateId: string
  readonly pairedSampleCount: number
  /**
   * Normalized so values above 1 always mean the candidate is better,
   * irrespective of whether the underlying metric is throughput or latency.
   */
  readonly ratios: readonly number[]
  readonly medianRatio: number
  readonly geometricMeanRatio: number
  readonly percentChange: number
  readonly confidenceInterval: BenchmarkConfidenceIntervalV1
  readonly verdict: BenchmarkComparisonVerdict
  readonly correctness: BenchmarkCorrectnessStatus
}

export interface BenchmarkCompilationV1 {
  readonly candidateId: string
  readonly status: BenchmarkCompilationStatus
  readonly elapsedMs: number | null
  readonly message?: string
}

export interface BenchmarkValidationIssueV1 {
  readonly code: string
  readonly message: string
  readonly path: string
  readonly severity: 'error' | 'warning'
}

export interface BenchmarkValidationV1 {
  readonly status: BenchmarkValidationStatus
  readonly issues: readonly BenchmarkValidationIssueV1[]
}

export interface BenchmarkResultV1 {
  readonly schemaVersion: typeof BENCHMARK_RESULT_SCHEMA_VERSION
  readonly id: string
  readonly manifestId: string
  readonly status: BenchmarkRunStatus
  readonly startedAt: string
  readonly completedAt?: string
  readonly device: BenchmarkDeviceSnapshotV1
  readonly compilation: readonly BenchmarkCompilationV1[]
  readonly samples: readonly BenchmarkSampleV1[]
  readonly candidates: readonly BenchmarkCandidateSummaryV1[]
  readonly comparison?: BenchmarkComparisonSummaryV1
  readonly validation: BenchmarkValidationV1
  readonly metadata: JsonObject
}

export const BENCHMARK_RUN_STATUS_LABELS: Readonly<
  Record<BenchmarkRunStatus, string>
> = {
  cancelled: 'Cancelled',
  completed: 'Complete',
  failed: 'Failed',
  invalid: 'Invalid run',
  preparing: 'Preparing',
  queued: 'Queued',
  running: 'Measuring',
  'warming-up': 'Warming up',
}

export const BENCHMARK_SAMPLE_STATUS_LABELS: Readonly<
  Record<BenchmarkSampleStatus, string>
> = {
  invalid: 'Excluded',
  valid: 'Valid',
}

export const BENCHMARK_VALIDATION_STATUS_LABELS: Readonly<
  Record<BenchmarkValidationStatus, string>
> = {
  invalid: 'Invalid',
  valid: 'Validated',
  warning: 'Valid with warnings',
}

export const BENCHMARK_COMPARISON_VERDICT_LABELS: Readonly<
  Record<BenchmarkComparisonVerdict, string>
> = {
  equivalent: 'Practically equivalent',
  faster: 'Candidate is faster',
  inconclusive: 'No clear winner',
  'insufficient-data': 'More samples needed',
  invalid: 'Comparison invalid',
  slower: 'Candidate is slower',
}

export const BENCHMARK_INVALID_REASON_LABELS: Readonly<
  Record<BenchmarkInvalidReason, string>
> = {
  cancelled: 'Run cancelled',
  'correctness-failed': 'Correctness check failed',
  'device-lost': 'GPU device was lost',
  'hidden-tab': 'Tab was hidden',
  'non-finite-metric': 'Metric was not finite',
  'protocol-violation': 'Benchmark protocol was violated',
  'queue-error': 'GPU queue failed',
  saturation: 'Accumulator saturation detected',
  'thermal-drift': 'Excessive performance drift detected',
  'timing-unavailable': 'Requested timing method unavailable',
  unknown: 'Unknown invalidation reason',
}
