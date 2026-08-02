import { describe, expect, it } from 'vitest'
import { arithmeticMean, bootstrapConfidenceInterval, coefficientOfVariation, comparePairedMeasurements, geometricMean, median, medianAbsoluteDeviation, pairedRatios, percentile, summarizeDistribution, } from './statistics'

describe('distribution statistics', () => {
  it('calculates mean, median, interpolated percentiles, MAD, and CV', () => {
    expect(arithmeticMean([1, 2, 3, 4])).toBe(2.5)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(percentile([1, 2, 3, 4], 0.25)).toBe(1.75)
    expect(medianAbsoluteDeviation([1, 1, 2, 2, 4, 6, 9])).toBe(1)
    expect(coefficientOfVariation([10, 10, 10])).toBe(0)
    expect(coefficientOfVariation([10])).toBeUndefined()
    expect(coefficientOfVariation([-1, 1])).toBeUndefined()
  })

  it('returns undefined for empty samples and rejects non-finite values', () => {
    expect(median([])).toBeUndefined()
    expect(summarizeDistribution([])).toBeUndefined()
    expect(() => median([1, Number.NaN])).toThrow(/finite/)
    expect(() => percentile([1], 1.1)).toThrow(/between 0 and 1/)
  })

  it('calculates a geometric mean in log space', () => {
    expect(geometricMean([1, 4])).toBe(2)
    expect(geometricMean([])).toBeUndefined()
    expect(() => geometricMean([0, 1])).toThrow(/positive/)
  })

  it('summarizes a distribution without mutating the source values', () => {
    const values = [120, 100, 110]
    const summary = summarizeDistribution(values, {
      resamples: 200,
      seed: 17,
    })

    expect(values).toEqual([120, 100, 110])
    expect(summary).toMatchObject({
      count: 3,
      min: 100,
      max: 120,
      mean: 110,
      median: 110,
      p10: 102,
      p90: 118,
      mad: 10,
    })
  })
})

describe('bootstrapConfidenceInterval', () => {
  it('is deterministic for the same seed and records its protocol', () => {
    const first = bootstrapConfidenceInterval([90, 95, 100, 105, 110], median, {
      confidenceLevel: 0.9,
      resamples: 400,
      seed: 42,
    })
    const second = bootstrapConfidenceInterval(
      [90, 95, 100, 105, 110],
      median,
      {
        confidenceLevel: 0.9,
        resamples: 400,
        seed: 42,
      },
    )

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      level: 0.9,
      method: 'deterministic-percentile-bootstrap',
      resamples: 400,
      seed: 42,
    })
    expect(first!.low).toBeLessThanOrEqual(100)
    expect(first!.high).toBeGreaterThanOrEqual(100)
  })

  it('collapses to the observation for a singleton sample', () => {
    expect(
      bootstrapConfidenceInterval([7], median, {
        resamples: 10,
        seed: 1,
      }),
    ).toMatchObject({ low: 7, high: 7 })
  })
})

describe('paired comparisons', () => {
  it('normalizes ratios so above one always means the candidate is better', () => {
    expect(
      pairedRatios({
        baseline: [100, 200],
        candidate: [120, 220],
      }),
    ).toEqual([1.2, 1.1])
    expect(
      pairedRatios(
        {
          baseline: [10, 20],
          candidate: [8, 10],
        },
        'lower-is-better',
      ),
    ).toEqual([1.25, 2])
  })

  it('reports a confident candidate speedup from paired samples', () => {
    const comparison = comparePairedMeasurements(
      {
        baseline: [100, 101, 99, 100, 102, 98, 100],
        candidate: [120, 121.2, 118.8, 120, 122.4, 117.6, 120],
      },
      {
        baselineCandidateId: 'current',
        candidateId: 'optimized',
        correctness: 'passed',
        resamples: 300,
        seed: 9,
      },
    )

    expect(comparison).toMatchObject({
      pairedSampleCount: 7,
      medianRatio: 1.2,
      geometricMeanRatio: 1.2,
      verdict: 'faster',
      correctness: 'passed',
    })
    expect(comparison!.percentChange).toBeCloseTo(20)
    expect(comparison!.confidenceInterval).toMatchObject({
      low: 1.2,
      high: 1.2,
    })
  })

  it('distinguishes equivalent, insufficient, and invalid comparisons', () => {
    const equivalent = comparePairedMeasurements(
      {
        baseline: [100, 100, 100, 100, 100],
        candidate: [101, 101, 101, 101, 101],
      },
      {
        baselineCandidateId: 'A',
        candidateId: 'B',
        resamples: 20,
      },
    )
    expect(equivalent!.verdict).toBe('equivalent')

    const insufficient = comparePairedMeasurements(
      { baseline: [100, 100], candidate: [120, 120] },
      {
        baselineCandidateId: 'A',
        candidateId: 'B',
        resamples: 20,
      },
    )
    expect(insufficient!.verdict).toBe('insufficient-data')

    const incorrect = comparePairedMeasurements(
      {
        baseline: [100, 100, 100, 100, 100],
        candidate: [120, 120, 120, 120, 120],
      },
      {
        baselineCandidateId: 'A',
        candidateId: 'B',
        correctness: 'failed',
        resamples: 20,
      },
    )
    expect(incorrect!.verdict).toBe('invalid')
  })

  it('rejects unpaired, non-positive, and self comparisons', () => {
    expect(() => pairedRatios({ baseline: [1], candidate: [1, 2] })).toThrow(
      /same number/,
    )
    expect(() => pairedRatios({ baseline: [0], candidate: [1] })).toThrow(
      /positive/,
    )
    expect(() =>
      comparePairedMeasurements(
        { baseline: [1], candidate: [2] },
        {
          baselineCandidateId: 'same',
          candidateId: 'same',
          minimumPairs: 1,
        },
      ),
    ).toThrow(/different/)
  })
})
