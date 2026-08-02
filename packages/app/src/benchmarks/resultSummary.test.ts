import { describe, expect, it } from 'vitest'
import { deriveBenchmarkCandidateSummaries, deriveBenchmarkComparison, } from './resultSummary'
import { createTestBenchmarkManifest, createTestBenchmarkSample, } from './testFixtures'

describe('benchmark result derivation', () => {
  it('excludes warmups and counts invalid measured samples', () => {
    const manifest = createTestBenchmarkManifest()
    const samples = manifest.schedule.map(({ sequence }) =>
      createTestBenchmarkSample(manifest, 'run', sequence),
    )
    const candidateId = manifest.candidates[1]!.id
    const invalidIndex = samples.findIndex(
      (sample) =>
        sample.phase === 'measured' &&
        sample.candidateId === candidateId &&
        sample.pairIndex === 1,
    )
    const withInvalid = samples.map((sample, index) =>
      index === invalidIndex
        ? {
            ...sample,
            status: 'invalid' as const,
            elapsedMs: null,
            completedWork: null,
            throughput: null,
            invalidReasons: ['thermal-drift' as const],
          }
        : sample,
    )

    const summaries = deriveBenchmarkCandidateSummaries(manifest, withInvalid, {
      resamples: 20,
      seed: 1,
    })
    expect(summaries).toEqual([
      expect.objectContaining({
        candidateId: 'baseline',
        validSampleCount: 2,
        invalidSampleCount: 0,
      }),
      expect.objectContaining({
        candidateId: 'candidate',
        validSampleCount: 1,
        invalidSampleCount: 1,
      }),
    ])

    const comparison = deriveBenchmarkComparison(manifest, withInvalid, {
      minimumPairs: 1,
      resamples: 20,
      seed: 1,
    })
    expect(comparison).toMatchObject({
      pairedSampleCount: 1,
      ratios: [1.2],
      geometricMeanRatio: 1.2,
    })
  })

  it('pairs by pairIndex independently of raw sample array order', () => {
    const manifest = createTestBenchmarkManifest()
    const samples = manifest.schedule.map(({ sequence }) =>
      createTestBenchmarkSample(manifest, 'run', sequence),
    )
    const forward = deriveBenchmarkComparison(manifest, samples, {
      resamples: 20,
      seed: 2,
    })
    const reversed = deriveBenchmarkComparison(
      manifest,
      [...samples].reverse(),
      {
        resamples: 20,
        seed: 2,
      },
    )

    expect(reversed).toEqual(forward)
  })
})
