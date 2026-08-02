import { comparePairedMeasurements, summarizeDistribution } from './statistics'
import type { BenchmarkCandidateSummaryV1, BenchmarkComparisonSummaryV1, BenchmarkCorrectnessStatus, BenchmarkManifestV1, BenchmarkSampleV1, } from './model'
import type { BootstrapOptions, PairedComparisonOptions } from './statistics'

export type DeriveBenchmarkComparisonOptions = BootstrapOptions &
  Pick<PairedComparisonOptions, 'equivalenceThreshold' | 'minimumPairs'> & {
    readonly correctness?: BenchmarkCorrectnessStatus
  }

function validMeasuredThroughputs(
  candidateId: string,
  samples: readonly BenchmarkSampleV1[],
): readonly number[] {
  return samples.flatMap((sample) =>
    sample.phase === 'measured' &&
    sample.candidateId === candidateId &&
    sample.status === 'valid' &&
    sample.throughput !== null
      ? [sample.throughput]
      : [],
  )
}

export function deriveBenchmarkCandidateSummary(
  candidateId: string,
  samples: readonly BenchmarkSampleV1[],
  options: BootstrapOptions = {},
): BenchmarkCandidateSummaryV1 {
  const measured = samples.filter(
    (sample) =>
      sample.phase === 'measured' && sample.candidateId === candidateId,
  )
  const throughputs = validMeasuredThroughputs(candidateId, measured)
  return {
    candidateId,
    validSampleCount: throughputs.length,
    invalidSampleCount: measured.length - throughputs.length,
    ...(throughputs.length > 0
      ? { throughput: summarizeDistribution(throughputs, options)! }
      : {}),
  }
}

export function deriveBenchmarkCandidateSummaries(
  manifest: BenchmarkManifestV1,
  samples: readonly BenchmarkSampleV1[],
  options: BootstrapOptions = {},
): readonly BenchmarkCandidateSummaryV1[] {
  return manifest.candidates.map(({ id }) =>
    deriveBenchmarkCandidateSummary(id, samples, options),
  )
}

/**
 * Derives paired comparison evidence from raw valid measured samples. Sorting
 * pair indexes makes the output stable even when imported sample rows arrive
 * in a different array order.
 */
export function deriveBenchmarkComparison(
  manifest: BenchmarkManifestV1,
  samples: readonly BenchmarkSampleV1[],
  options: DeriveBenchmarkComparisonOptions = {},
): BenchmarkComparisonSummaryV1 | undefined {
  if (manifest.mode !== 'comparison') return undefined

  const [baseline, candidate] = manifest.candidates
  const measured = samples.filter(
    (sample) =>
      sample.phase === 'measured' &&
      sample.status === 'valid' &&
      sample.throughput !== null,
  )
  const baselineByPair = new Map(
    measured
      .filter((sample) => sample.candidateId === baseline.id)
      .map((sample) => [sample.pairIndex, sample.throughput!] as const),
  )
  const candidateByPair = new Map(
    measured
      .filter((sample) => sample.candidateId === candidate.id)
      .map((sample) => [sample.pairIndex, sample.throughput!] as const),
  )
  const pairIndexes = [...baselineByPair.keys()]
    .filter((pairIndex) => candidateByPair.has(pairIndex))
    .sort((left, right) => left - right)

  return comparePairedMeasurements(
    {
      baseline: pairIndexes.map((pairIndex) => baselineByPair.get(pairIndex)!),
      candidate: pairIndexes.map(
        (pairIndex) => candidateByPair.get(pairIndex)!,
      ),
    },
    {
      baselineCandidateId: baseline.id,
      candidateId: candidate.id,
      direction: manifest.protocol.metric.direction,
      correctness: options.correctness,
      equivalenceThreshold: options.equivalenceThreshold,
      minimumPairs:
        options.minimumPairs ?? Math.min(5, manifest.protocol.measuredPairs),
      confidenceLevel: options.confidenceLevel,
      resamples: options.resamples,
      seed: options.seed,
    },
  )
}
