import { describe, expect, it } from 'vitest'
import { createBalancedComparisonSchedule, createSingleCandidateSchedule, } from './schedule'

describe('createBalancedComparisonSchedule', () => {
  it('alternates AB and BA independently for warmup and measured pairs', () => {
    const schedule = createBalancedComparisonSchedule({
      baselineCandidateId: 'baseline',
      candidateId: 'candidate',
      warmupPairs: 2,
      measuredPairs: 3,
      firstWarmupOrder: 'AB',
      firstMeasuredOrder: 'BA',
    })

    expect(schedule).toHaveLength(10)
    expect(schedule.map(({ sequence }) => sequence)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
    expect(
      schedule
        .filter(({ phase }) => phase === 'warmup')
        .map(({ candidateId }) => candidateId),
    ).toEqual(['baseline', 'candidate', 'candidate', 'baseline'])
    expect(
      schedule
        .filter(({ phase }) => phase === 'measured')
        .map(({ candidateId }) => candidateId),
    ).toEqual([
      'candidate',
      'baseline',
      'baseline',
      'candidate',
      'candidate',
      'baseline',
    ])
  })

  it('keeps candidate sample counts equal for an odd number of pairs', () => {
    const schedule = createBalancedComparisonSchedule({
      baselineCandidateId: 'A',
      candidateId: 'B',
      measuredPairs: 7,
    })

    const counts = schedule.reduce<Record<string, number>>(
      (result, { candidateId }) => ({
        ...result,
        [candidateId]: (result[candidateId] ?? 0) + 1,
      }),
      {},
    )
    expect(counts).toEqual({ A: 7, B: 7 })
    expect(
      schedule
        .filter(({ orderInPair }) => orderInPair === 0)
        .map(({ blockOrder }) => blockOrder),
    ).toEqual(['AB', 'BA', 'AB', 'BA', 'AB', 'BA', 'AB'])
  })

  it('rejects invalid counts and duplicate candidate ids', () => {
    expect(() =>
      createBalancedComparisonSchedule({
        baselineCandidateId: 'same',
        candidateId: 'same',
        measuredPairs: 1,
      }),
    ).toThrow(/different/)
    expect(() =>
      createBalancedComparisonSchedule({
        baselineCandidateId: 'A',
        candidateId: 'B',
        measuredPairs: 0,
      }),
    ).toThrow(/greater than zero/)
    expect(() =>
      createBalancedComparisonSchedule({
        baselineCandidateId: 'A',
        candidateId: 'B',
        measuredPairs: 1.5,
      }),
    ).toThrow(/safe integer/)
  })
})

describe('createSingleCandidateSchedule', () => {
  it('places warmups before measured samples with contiguous sequence ids', () => {
    const schedule = createSingleCandidateSchedule({
      candidateId: 'current',
      warmupSamples: 2,
      measuredSamples: 3,
    })

    expect(schedule.map(({ phase }) => phase)).toEqual([
      'warmup',
      'warmup',
      'measured',
      'measured',
      'measured',
    ])
    expect(schedule.map(({ sequence }) => sequence)).toEqual([0, 1, 2, 3, 4])
    expect(schedule.every(({ candidateId }) => candidateId === 'current')).toBe(
      true,
    )
  })
})
