import type { BenchmarkComparisonSummaryV1, BenchmarkConfidenceIntervalV1, BenchmarkCorrectnessStatus, BenchmarkDistributionSummaryV1, BenchmarkMetricDirection, } from './model'

const DEFAULT_BOOTSTRAP_RESAMPLES = 2_000
const DEFAULT_CONFIDENCE_LEVEL = 0.95
const DEFAULT_BOOTSTRAP_SEED = 0x4348_414f
const DEFAULT_EQUIVALENCE_THRESHOLD = 0.02

export interface BootstrapOptions {
  readonly confidenceLevel?: number
  readonly resamples?: number
  readonly seed?: number
}

export type DistributionSummaryOptions = BootstrapOptions

export interface PairedMeasurements {
  readonly baseline: readonly number[]
  readonly candidate: readonly number[]
}

export interface PairedComparisonOptions extends BootstrapOptions {
  readonly baselineCandidateId: string
  readonly candidateId: string
  readonly direction?: BenchmarkMetricDirection
  readonly correctness?: BenchmarkCorrectnessStatus
  /**
   * Relative band around parity used to call a result practically equivalent.
   * A value of 0.02 represents ±2%.
   */
  readonly equivalenceThreshold?: number
  readonly minimumPairs?: number
}

type Statistic = (values: readonly number[]) => number | undefined

function assertFiniteValues(values: readonly number[], name = 'values'): void {
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`${name} must contain only finite numbers`)
    }
  }
}

function assertPositiveValues(
  values: readonly number[],
  name = 'values',
): void {
  assertFiniteValues(values, name)
  if (values.some((value) => value <= 0)) {
    throw new RangeError(`${name} must contain only positive numbers`)
  }
}

function sorted(values: readonly number[]): number[] {
  assertFiniteValues(values)
  return [...values].sort((a, b) => a - b)
}

export function arithmeticMean(values: readonly number[]): number | undefined {
  assertFiniteValues(values)
  if (values.length === 0) return undefined
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * R-7 quantile interpolation, matching the default method used by R, NumPy,
 * and many statistical tools.
 */
export function percentile(
  values: readonly number[],
  probability: number,
): number | undefined {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError('probability must be between 0 and 1')
  }
  if (values.length === 0) return undefined

  const ordered = sorted(values)
  const index = (ordered.length - 1) * probability
  const lowerIndex = Math.floor(index)
  const upperIndex = Math.ceil(index)
  const lower = ordered[lowerIndex]!
  const upper = ordered[upperIndex]!
  return lower + (upper - lower) * (index - lowerIndex)
}

export function median(values: readonly number[]): number | undefined {
  return percentile(values, 0.5)
}

export function medianAbsoluteDeviation(
  values: readonly number[],
): number | undefined {
  const center = median(values)
  if (center === undefined) return undefined
  return median(values.map((value) => Math.abs(value - center)))
}

export function sampleStandardDeviation(
  values: readonly number[],
): number | undefined {
  assertFiniteValues(values)
  if (values.length < 2) return undefined

  const mean = arithmeticMean(values)!
  const squaredError = values.reduce((sum, value) => {
    const error = value - mean
    return sum + error * error
  }, 0)
  return Math.sqrt(squaredError / (values.length - 1))
}

export function coefficientOfVariation(
  values: readonly number[],
): number | undefined {
  const mean = arithmeticMean(values)
  if (mean === undefined || mean === 0) return undefined
  const standardDeviation = sampleStandardDeviation(values)
  if (standardDeviation === undefined) return undefined
  return standardDeviation / Math.abs(mean)
}

export function geometricMean(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined
  assertPositiveValues(values)
  return Math.exp(
    values.reduce((sum, value) => sum + Math.log(value), 0) / values.length,
  )
}

function normalizeSeed(seed: number): number {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError('seed must be a safe integer')
  }
  const normalized = seed >>> 0
  // xorshift32 has an absorbing all-zero state.
  return normalized === 0 ? 0x6d2b_79f5 : normalized
}

function createDeterministicRandom(seed: number): () => number {
  let state = normalizeSeed(seed)
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x1_0000_0000
  }
}

export function bootstrapConfidenceInterval(
  values: readonly number[],
  statistic: Statistic = median,
  options: BootstrapOptions = {},
): BenchmarkConfidenceIntervalV1 | undefined {
  assertFiniteValues(values)
  if (values.length === 0) return undefined

  const {
    confidenceLevel = DEFAULT_CONFIDENCE_LEVEL,
    resamples = DEFAULT_BOOTSTRAP_RESAMPLES,
    seed = DEFAULT_BOOTSTRAP_SEED,
  } = options
  if (
    !Number.isFinite(confidenceLevel) ||
    confidenceLevel <= 0 ||
    confidenceLevel >= 1
  ) {
    throw new RangeError('confidenceLevel must be between 0 and 1')
  }
  if (!Number.isSafeInteger(resamples) || resamples < 1) {
    throw new RangeError('resamples must be a positive safe integer')
  }

  const random = createDeterministicRandom(seed)
  const estimates: number[] = []
  const sample = new Array<number>(values.length)
  for (let iteration = 0; iteration < resamples; iteration += 1) {
    for (let index = 0; index < values.length; index += 1) {
      sample[index] = values[Math.floor(random() * values.length)]!
    }
    const estimate = statistic(sample)
    if (estimate === undefined || !Number.isFinite(estimate)) {
      throw new RangeError('statistic must return a finite number')
    }
    estimates.push(estimate)
  }

  const tailProbability = (1 - confidenceLevel) / 2
  return {
    level: confidenceLevel,
    low: percentile(estimates, tailProbability)!,
    high: percentile(estimates, 1 - tailProbability)!,
    method: 'deterministic-percentile-bootstrap',
    resamples,
    seed: normalizeSeed(seed),
  }
}

export function summarizeDistribution(
  values: readonly number[],
  options: DistributionSummaryOptions = {},
): BenchmarkDistributionSummaryV1 | undefined {
  assertFiniteValues(values)
  if (values.length === 0) return undefined

  const ordered = sorted(values)
  const confidenceInterval = bootstrapConfidenceInterval(
    ordered,
    median,
    options,
  )!
  const cv = coefficientOfVariation(ordered)
  return {
    count: ordered.length,
    min: ordered[0]!,
    max: ordered.at(-1)!,
    mean: arithmeticMean(ordered)!,
    median: median(ordered)!,
    p10: percentile(ordered, 0.1)!,
    p90: percentile(ordered, 0.9)!,
    mad: medianAbsoluteDeviation(ordered)!,
    ...(cv === undefined ? {} : { cv }),
    confidenceInterval,
  }
}

export function pairedRatios(
  measurements: PairedMeasurements,
  direction: BenchmarkMetricDirection = 'higher-is-better',
): readonly number[] {
  const { baseline, candidate } = measurements
  if (baseline.length !== candidate.length) {
    throw new RangeError(
      'baseline and candidate must contain the same number of paired values',
    )
  }
  assertPositiveValues(baseline, 'baseline')
  assertPositiveValues(candidate, 'candidate')

  return baseline.map((baselineValue, index) => {
    const candidateValue = candidate[index]!
    return direction === 'higher-is-better'
      ? candidateValue / baselineValue
      : baselineValue / candidateValue
  })
}

function classifyComparison(
  confidenceInterval: BenchmarkConfidenceIntervalV1,
  pairCount: number,
  correctness: BenchmarkCorrectnessStatus,
  minimumPairs: number,
  equivalenceThreshold: number,
): BenchmarkComparisonSummaryV1['verdict'] {
  if (correctness === 'failed') return 'invalid'
  if (pairCount < minimumPairs) return 'insufficient-data'

  const lowerEquivalentBound = 1 - equivalenceThreshold
  const upperEquivalentBound = 1 + equivalenceThreshold
  if (confidenceInterval.low > upperEquivalentBound) return 'faster'
  if (confidenceInterval.high < lowerEquivalentBound) return 'slower'
  if (
    confidenceInterval.low >= lowerEquivalentBound &&
    confidenceInterval.high <= upperEquivalentBound
  ) {
    return 'equivalent'
  }
  return 'inconclusive'
}

export function comparePairedMeasurements(
  measurements: PairedMeasurements,
  options: PairedComparisonOptions,
): BenchmarkComparisonSummaryV1 | undefined {
  const ratios = pairedRatios(
    measurements,
    options.direction ?? 'higher-is-better',
  )
  if (ratios.length === 0) return undefined

  const {
    baselineCandidateId,
    candidateId,
    correctness = 'not-checked',
    equivalenceThreshold = DEFAULT_EQUIVALENCE_THRESHOLD,
    minimumPairs = 5,
  } = options
  if (baselineCandidateId === candidateId) {
    throw new RangeError('Comparison candidate ids must be different')
  }
  if (
    !Number.isFinite(equivalenceThreshold) ||
    equivalenceThreshold < 0 ||
    equivalenceThreshold >= 1
  ) {
    throw new RangeError(
      'equivalenceThreshold must be between 0 (inclusive) and 1',
    )
  }
  if (!Number.isSafeInteger(minimumPairs) || minimumPairs < 1) {
    throw new RangeError('minimumPairs must be a positive safe integer')
  }

  const confidenceInterval = bootstrapConfidenceInterval(
    ratios,
    geometricMean,
    options,
  )!
  const geometricMeanRatio = geometricMean(ratios)!
  return {
    baselineCandidateId,
    candidateId,
    pairedSampleCount: ratios.length,
    ratios,
    medianRatio: median(ratios)!,
    geometricMeanRatio,
    percentChange: (geometricMeanRatio - 1) * 100,
    confidenceInterval,
    verdict: classifyComparison(
      confidenceInterval,
      ratios.length,
      correctness,
      minimumPairs,
      equivalenceThreshold,
    ),
    correctness,
  }
}
