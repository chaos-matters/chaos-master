import type { BenchmarkBlockOrder, BenchmarkPhase, BenchmarkScheduleEntryV1, } from './model'

export interface ComparisonScheduleOptions {
  readonly baselineCandidateId: string
  readonly candidateId: string
  readonly measuredPairs: number
  readonly warmupPairs?: number
  readonly firstMeasuredOrder?: BenchmarkBlockOrder
  readonly firstWarmupOrder?: BenchmarkBlockOrder
}

export interface SingleCandidateScheduleOptions {
  readonly candidateId: string
  readonly measuredSamples: number
  readonly warmupSamples?: number
}

function assertIdentifier(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new RangeError(`${name} must not be empty`)
  }
}

function assertCount(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`)
  }
}

function oppositeOrder(order: BenchmarkBlockOrder): BenchmarkBlockOrder {
  return order === 'AB' ? 'BA' : 'AB'
}

function appendComparisonPhase(
  schedule: BenchmarkScheduleEntryV1[],
  phase: BenchmarkPhase,
  pairCount: number,
  firstOrder: BenchmarkBlockOrder,
  baselineCandidateId: string,
  candidateId: string,
): void {
  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const blockOrder =
      pairIndex % 2 === 0 ? firstOrder : oppositeOrder(firstOrder)
    const candidateIds =
      blockOrder === 'AB'
        ? ([baselineCandidateId, candidateId] as const)
        : ([candidateId, baselineCandidateId] as const)

    for (const [orderInPair, scheduledCandidateId] of candidateIds.entries()) {
      schedule.push({
        sequence: schedule.length,
        phase,
        pairIndex,
        orderInPair: orderInPair as 0 | 1,
        blockOrder,
        candidateId: scheduledCandidateId,
      })
    }
  }
}

/**
 * Produces paired blocks in an alternating AB/BA order. Each pair contains one
 * sample from each candidate, so both sample counts remain equal even when the
 * requested number of pairs is odd.
 */
export function createBalancedComparisonSchedule(
  options: ComparisonScheduleOptions,
): readonly BenchmarkScheduleEntryV1[] {
  const {
    baselineCandidateId,
    candidateId,
    measuredPairs,
    warmupPairs = 0,
    firstMeasuredOrder = 'AB',
    firstWarmupOrder = 'AB',
  } = options

  assertIdentifier(baselineCandidateId, 'baselineCandidateId')
  assertIdentifier(candidateId, 'candidateId')
  if (baselineCandidateId === candidateId) {
    throw new RangeError('Comparison candidate ids must be different')
  }
  assertCount(warmupPairs, 'warmupPairs')
  assertCount(measuredPairs, 'measuredPairs')
  if (measuredPairs === 0) {
    throw new RangeError('measuredPairs must be greater than zero')
  }

  const schedule: BenchmarkScheduleEntryV1[] = []
  appendComparisonPhase(
    schedule,
    'warmup',
    warmupPairs,
    firstWarmupOrder,
    baselineCandidateId,
    candidateId,
  )
  appendComparisonPhase(
    schedule,
    'measured',
    measuredPairs,
    firstMeasuredOrder,
    baselineCandidateId,
    candidateId,
  )
  return schedule
}

export function createSingleCandidateSchedule(
  options: SingleCandidateScheduleOptions,
): readonly BenchmarkScheduleEntryV1[] {
  const { candidateId, measuredSamples, warmupSamples = 0 } = options

  assertIdentifier(candidateId, 'candidateId')
  assertCount(warmupSamples, 'warmupSamples')
  assertCount(measuredSamples, 'measuredSamples')
  if (measuredSamples === 0) {
    throw new RangeError('measuredSamples must be greater than zero')
  }

  const schedule: BenchmarkScheduleEntryV1[] = []
  const append = (phase: BenchmarkPhase, count: number): void => {
    for (let pairIndex = 0; pairIndex < count; pairIndex += 1) {
      schedule.push({
        sequence: schedule.length,
        phase,
        pairIndex,
        orderInPair: 0,
        blockOrder: 'AB',
        candidateId,
      })
    }
  }

  append('warmup', warmupSamples)
  append('measured', measuredSamples)
  return schedule
}
