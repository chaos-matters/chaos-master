import { BENCHMARK_MANIFEST_SCHEMA_VERSION, BENCHMARK_RESULT_SCHEMA_VERSION, BENCHMARK_SAMPLE_SCHEMA_VERSION, } from './model'
import { deriveBenchmarkCandidateSummary, deriveBenchmarkComparison, } from './resultSummary'
import type { BenchmarkComparisonSummaryV1, BenchmarkDistributionSummaryV1, BenchmarkManifestV1, BenchmarkResultV1, BenchmarkSampleV1, BenchmarkValidationIssueV1, BenchmarkValidationV1, } from './model'
import type { BootstrapOptions } from './statistics'

export const BENCHMARK_VALIDATION_ISSUE_LABELS = {
  'candidate-count': 'Candidate count does not match benchmark mode',
  'candidate-id': 'Candidate reference is invalid',
  'duplicate-id': 'Identifier must be unique',
  'invalid-date': 'Timestamp is not a valid ISO date',
  'invalid-number': 'Number is outside the allowed range',
  'invalid-status': 'Status is not recognized',
  'metric-mismatch': 'Reported throughput does not match sample timing',
  'missing-field': 'Required field is missing',
  'protocol-count': 'Protocol sample count is invalid',
  'result-state': 'Result state is internally inconsistent',
  'schedule-count': 'Schedule length does not match the protocol',
  'schedule-entry': 'Schedule entry is internally inconsistent',
  'schedule-order': 'Comparison order is not balanced AB/BA',
  'sample-coverage': 'Samples do not exactly cover the manifest schedule',
  'schema-version': 'Schema version is unsupported',
  'summary-mismatch': 'Stored summary does not match raw measured samples',
  type: 'Value has the wrong type',
} as const

export type BenchmarkValidationIssueCode =
  keyof typeof BENCHMARK_VALIDATION_ISSUE_LABELS

type MutableValidationIssue = {
  code: string
  message: string
  path: string
  severity: BenchmarkValidationIssueV1['severity']
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function issue(
  issues: MutableValidationIssue[],
  code: BenchmarkValidationIssueCode,
  path: string,
  message: string,
  severity: BenchmarkValidationIssueV1['severity'] = 'error',
): void {
  issues.push({ code, path, message, severity })
}

function finishValidation(
  issues: readonly MutableValidationIssue[],
): BenchmarkValidationV1 {
  const hasError = issues.some(({ severity }) => severity === 'error')
  return {
    status: hasError ? 'invalid' : issues.length > 0 ? 'warning' : 'valid',
    issues,
  }
}

function validateCommonEnvelope(
  input: unknown,
  expectedVersion: string,
  issues: MutableValidationIssue[],
): input is Record<string, unknown> {
  if (!isRecord(input)) {
    issue(issues, 'type', '$', 'Expected an object')
    return false
  }
  if (input.schemaVersion !== expectedVersion) {
    issue(
      issues,
      'schema-version',
      '$.schemaVersion',
      `Expected ${expectedVersion}`,
    )
  }
  if (!isNonEmptyString(input.id)) {
    issue(issues, 'missing-field', '$.id', 'Expected a non-empty id')
  }
  return true
}

function validateManifestCandidates(
  input: Record<string, unknown>,
  issues: MutableValidationIssue[],
): readonly string[] {
  const mode = input.mode
  if (mode !== 'comparison' && mode !== 'single') {
    issue(issues, 'type', '$.mode', 'Expected "single" or "comparison"')
  }

  if (!Array.isArray(input.candidates)) {
    issue(issues, 'type', '$.candidates', 'Expected an array of candidates')
    return []
  }

  const expectedCount = mode === 'comparison' ? 2 : mode === 'single' ? 1 : 0
  if (input.candidates.length !== expectedCount) {
    issue(
      issues,
      'candidate-count',
      '$.candidates',
      `${String(mode)} benchmarks require ${expectedCount} candidate${
        expectedCount === 1 ? '' : 's'
      }`,
    )
  }

  const ids: string[] = []
  for (const [index, candidate] of input.candidates.entries()) {
    const path = `$.candidates[${index}]`
    if (!isRecord(candidate)) {
      issue(issues, 'type', path, 'Expected a candidate object')
      continue
    }
    if (!isNonEmptyString(candidate.id)) {
      issue(issues, 'candidate-id', `${path}.id`, 'Expected a non-empty id')
      continue
    }
    if (ids.includes(candidate.id)) {
      issue(
        issues,
        'duplicate-id',
        `${path}.id`,
        `Candidate id "${candidate.id}" is duplicated`,
      )
    }
    ids.push(candidate.id)

    const expectedRole = index === 0 ? 'baseline' : 'candidate'
    if (candidate.role !== expectedRole) {
      issue(
        issues,
        'candidate-id',
        `${path}.role`,
        `Candidate ${index + 1} must have role "${expectedRole}"`,
      )
    }
  }
  return ids
}

function validateManifestProtocol(
  input: Record<string, unknown>,
  issues: MutableValidationIssue[],
): { measuredPairs: number; warmupPairs: number } | undefined {
  if (!isRecord(input.protocol)) {
    issue(issues, 'type', '$.protocol', 'Expected a protocol object')
    return undefined
  }
  const { measuredPairs, warmupPairs } = input.protocol
  if (!isNonNegativeSafeInteger(warmupPairs)) {
    issue(
      issues,
      'protocol-count',
      '$.protocol.warmupPairs',
      'Expected a non-negative safe integer',
    )
  }
  if (!isNonNegativeSafeInteger(measuredPairs) || measuredPairs === 0) {
    issue(
      issues,
      'protocol-count',
      '$.protocol.measuredPairs',
      'Expected a positive safe integer',
    )
  }

  if (!isRecord(input.protocol.workBudget)) {
    issue(
      issues,
      'type',
      '$.protocol.workBudget',
      'Expected a work budget object',
    )
  } else {
    const budget = input.protocol.workBudget
    if (
      (budget.kind === 'fixed-duration' ||
        budget.kind === 'minimum-work-and-duration') &&
      !isPositiveFiniteNumber(budget.durationMs)
    ) {
      issue(
        issues,
        'invalid-number',
        '$.protocol.workBudget.durationMs',
        'Expected a positive finite duration',
      )
    }
    if (
      (budget.kind === 'fixed-work' ||
        budget.kind === 'minimum-work-and-duration') &&
      !isPositiveFiniteNumber(budget.workUnits)
    ) {
      issue(
        issues,
        'invalid-number',
        '$.protocol.workBudget.workUnits',
        'Expected a positive finite work count',
      )
    }
    if (
      budget.kind !== 'fixed-duration' &&
      budget.kind !== 'fixed-work' &&
      budget.kind !== 'minimum-work-and-duration'
    ) {
      issue(
        issues,
        'type',
        '$.protocol.workBudget.kind',
        'Expected "fixed-duration", "fixed-work", or "minimum-work-and-duration"',
      )
    }
  }

  return isNonNegativeSafeInteger(warmupPairs) &&
    isNonNegativeSafeInteger(measuredPairs) &&
    measuredPairs > 0
    ? { measuredPairs, warmupPairs }
    : undefined
}

interface ParsedScheduleEntry {
  readonly blockOrder: 'AB' | 'BA'
  readonly candidateId: string
  readonly orderInPair: number
  readonly pairIndex: number
  readonly phase: 'measured' | 'warmup'
  readonly sequence: number
}

function parseScheduleEntry(
  value: unknown,
  path: string,
  issues: MutableValidationIssue[],
): ParsedScheduleEntry | undefined {
  if (!isRecord(value)) {
    issue(issues, 'type', path, 'Expected a schedule entry object')
    return undefined
  }
  const { blockOrder, candidateId, orderInPair, pairIndex, phase, sequence } =
    value
  if (
    (blockOrder !== 'AB' && blockOrder !== 'BA') ||
    !isNonEmptyString(candidateId) ||
    (orderInPair !== 0 && orderInPair !== 1) ||
    !isNonNegativeSafeInteger(pairIndex) ||
    (phase !== 'measured' && phase !== 'warmup') ||
    !isNonNegativeSafeInteger(sequence)
  ) {
    issue(
      issues,
      'schedule-entry',
      path,
      'Entry must contain a valid phase, pair, order, sequence, and candidate',
    )
    return undefined
  }
  return {
    blockOrder,
    candidateId,
    orderInPair,
    pairIndex,
    phase,
    sequence,
  }
}

function validateComparisonBlocks(
  entries: readonly ParsedScheduleEntry[],
  candidateIds: readonly string[],
  issues: MutableValidationIssue[],
): void {
  for (const phase of ['warmup', 'measured'] as const) {
    const phaseEntries = entries.filter((entry) => entry.phase === phase)
    const pairIndices = [
      ...new Set(phaseEntries.map(({ pairIndex }) => pairIndex)),
    ]
    let previousOrder: 'AB' | 'BA' | undefined

    for (const pairIndex of pairIndices) {
      const block = phaseEntries
        .filter((entry) => entry.pairIndex === pairIndex)
        .sort((left, right) => left.orderInPair - right.orderInPair)
      const path = `$.schedule.${phase}[${pairIndex}]`
      if (
        block.length !== 2 ||
        block[0]?.orderInPair !== 0 ||
        block[1]?.orderInPair !== 1
      ) {
        issue(
          issues,
          'schedule-entry',
          path,
          'Every comparison pair must contain order positions 0 and 1',
        )
        continue
      }

      const [baselineId, candidateId] = candidateIds
      const expectedIds =
        block[0].blockOrder === 'AB'
          ? [baselineId, candidateId]
          : [candidateId, baselineId]
      if (
        block[1].blockOrder !== block[0].blockOrder ||
        block[0].candidateId !== expectedIds[0] ||
        block[1].candidateId !== expectedIds[1]
      ) {
        issue(
          issues,
          'schedule-entry',
          path,
          'Block order does not match its candidate sequence',
        )
      }
      if (previousOrder === block[0].blockOrder) {
        issue(
          issues,
          'schedule-order',
          path,
          'Successive comparison pairs must alternate AB and BA',
        )
      }
      previousOrder = block[0].blockOrder
    }
  }
}

function validateManifestSchedule(
  input: Record<string, unknown>,
  candidateIds: readonly string[],
  counts: { measuredPairs: number; warmupPairs: number } | undefined,
  issues: MutableValidationIssue[],
): void {
  if (!Array.isArray(input.schedule)) {
    issue(issues, 'type', '$.schedule', 'Expected a schedule array')
    return
  }

  const multiplier = input.mode === 'comparison' ? 2 : 1
  if (
    counts !== undefined &&
    input.schedule.length !==
      (counts.measuredPairs + counts.warmupPairs) * multiplier
  ) {
    issue(
      issues,
      'schedule-count',
      '$.schedule',
      'Schedule length does not match warmup and measured counts',
    )
  }

  const entries = input.schedule
    .map((entry, index) =>
      parseScheduleEntry(entry, `$.schedule[${index}]`, issues),
    )
    .filter((entry): entry is ParsedScheduleEntry => entry !== undefined)

  for (const [index, entry] of entries.entries()) {
    if (entry.sequence !== index) {
      issue(
        issues,
        'schedule-entry',
        `$.schedule[${index}].sequence`,
        `Expected contiguous sequence ${index}`,
      )
    }
    if (!candidateIds.includes(entry.candidateId)) {
      issue(
        issues,
        'candidate-id',
        `$.schedule[${index}].candidateId`,
        `Unknown candidate id "${entry.candidateId}"`,
      )
    }
  }

  if (counts !== undefined) {
    const warmupPairCount = new Set(
      entries
        .filter(({ phase }) => phase === 'warmup')
        .map(({ pairIndex }) => pairIndex),
    ).size
    const measuredPairCount = new Set(
      entries
        .filter(({ phase }) => phase === 'measured')
        .map(({ pairIndex }) => pairIndex),
    ).size
    if (
      warmupPairCount !== counts.warmupPairs ||
      measuredPairCount !== counts.measuredPairs
    ) {
      issue(
        issues,
        'schedule-count',
        '$.schedule',
        'Schedule pair indices do not match protocol counts',
      )
    }
  }

  if (input.mode === 'comparison' && candidateIds.length === 2) {
    validateComparisonBlocks(entries, candidateIds, issues)
  }
}

export function validateBenchmarkManifest(
  input: unknown,
): BenchmarkValidationV1 {
  const issues: MutableValidationIssue[] = []
  if (
    !validateCommonEnvelope(input, BENCHMARK_MANIFEST_SCHEMA_VERSION, issues)
  ) {
    return finishValidation(issues)
  }

  if (!hasIsoDate(input.createdAt)) {
    issue(
      issues,
      'invalid-date',
      '$.createdAt',
      'Expected an ISO-compatible timestamp',
    )
  }
  const candidateIds = validateManifestCandidates(input, issues)
  const counts = validateManifestProtocol(input, issues)
  validateManifestSchedule(input, candidateIds, counts, issues)

  if (!isRecord(input.workload)) {
    issue(issues, 'type', '$.workload', 'Expected a workload object')
  } else {
    for (const field of ['width', 'height', 'pointCount'] as const) {
      if (!isPositiveFiniteNumber(input.workload[field])) {
        issue(
          issues,
          'invalid-number',
          `$.workload.${field}`,
          'Expected a positive finite number',
        )
      }
    }
    if (!Number.isSafeInteger(input.workload.deterministicSeed)) {
      issue(
        issues,
        'invalid-number',
        '$.workload.deterministicSeed',
        'Expected a safe integer seed',
      )
    }
  }

  return finishValidation(issues)
}

export function isBenchmarkManifestV1(
  input: unknown,
): input is BenchmarkManifestV1 {
  return validateBenchmarkManifest(input).status !== 'invalid'
}

function validateNullableMetric(
  value: unknown,
  path: string,
  issues: MutableValidationIssue[],
): void {
  if (value !== null && !isPositiveFiniteNumber(value)) {
    issue(
      issues,
      'invalid-number',
      path,
      'Expected null or a positive finite number',
    )
  }
}

export function validateBenchmarkSample(
  input: unknown,
  manifest?: BenchmarkManifestV1,
): BenchmarkValidationV1 {
  const issues: MutableValidationIssue[] = []
  if (!validateCommonEnvelope(input, BENCHMARK_SAMPLE_SCHEMA_VERSION, issues)) {
    return finishValidation(issues)
  }

  if (!hasIsoDate(input.startedAt)) {
    issue(
      issues,
      'invalid-date',
      '$.startedAt',
      'Expected an ISO-compatible timestamp',
    )
  }
  if (input.status !== 'valid' && input.status !== 'invalid') {
    issue(issues, 'invalid-status', '$.status', 'Expected "valid" or "invalid"')
  }
  validateNullableMetric(input.elapsedMs, '$.elapsedMs', issues)
  validateNullableMetric(input.completedWork, '$.completedWork', issues)
  validateNullableMetric(input.throughput, '$.throughput', issues)

  if (!Array.isArray(input.invalidReasons)) {
    issue(
      issues,
      'type',
      '$.invalidReasons',
      'Expected an array of invalidation reasons',
    )
  } else if (input.status === 'valid' && input.invalidReasons.length > 0) {
    issue(
      issues,
      'result-state',
      '$.invalidReasons',
      'A valid sample cannot contain invalidation reasons',
    )
  } else if (input.status === 'invalid' && input.invalidReasons.length === 0) {
    issue(
      issues,
      'result-state',
      '$.invalidReasons',
      'An invalid sample must state at least one reason',
    )
  }

  if (input.status === 'valid') {
    if (
      !isPositiveFiniteNumber(input.elapsedMs) ||
      !isPositiveFiniteNumber(input.completedWork) ||
      !isPositiveFiniteNumber(input.throughput)
    ) {
      issue(
        issues,
        'result-state',
        '$',
        'A valid sample requires elapsed time, completed work, and throughput',
      )
    } else {
      const derivedThroughput = input.completedWork / (input.elapsedMs / 1_000)
      const relativeError =
        Math.abs(input.throughput - derivedThroughput) / derivedThroughput
      if (relativeError > 0.005) {
        issue(
          issues,
          'metric-mismatch',
          '$.throughput',
          'Throughput differs from completedWork / elapsedMs by more than 0.5%',
          'warning',
        )
      }
    }
  }

  if (manifest !== undefined) {
    if (input.manifestId !== manifest.id) {
      issue(
        issues,
        'candidate-id',
        '$.manifestId',
        'Sample belongs to a different manifest',
      )
    }
    if (!isNonNegativeSafeInteger(input.sequence)) {
      issue(
        issues,
        'schedule-entry',
        '$.sequence',
        'Expected a non-negative sequence',
      )
    } else {
      const expected = manifest.schedule[input.sequence]
      if (
        expected === undefined ||
        input.candidateId !== expected.candidateId ||
        input.phase !== expected.phase ||
        input.pairIndex !== expected.pairIndex ||
        input.orderInPair !== expected.orderInPair
      ) {
        issue(
          issues,
          'schedule-entry',
          '$',
          'Sample does not match its manifest schedule entry',
        )
      }
    }
    if (input.timingMode !== manifest.protocol.timingMode) {
      issue(
        issues,
        'schedule-entry',
        '$.timingMode',
        'Sample timing mode differs from its protocol',
      )
    }
  }

  return finishValidation(issues)
}

export function isBenchmarkSampleV1(
  input: unknown,
  manifest?: BenchmarkManifestV1,
): input is BenchmarkSampleV1 {
  return validateBenchmarkSample(input, manifest).status !== 'invalid'
}

function numbersMatch(actual: unknown, expected: number): actual is number {
  return (
    typeof actual === 'number' &&
    Number.isFinite(actual) &&
    Math.abs(actual - expected) <=
      1e-9 * Math.max(1, Math.abs(actual), Math.abs(expected))
  )
}

function validateDerivedNumber(
  actual: unknown,
  expected: number,
  path: string,
  issues: MutableValidationIssue[],
): void {
  if (!numbersMatch(actual, expected)) {
    issue(
      issues,
      'summary-mismatch',
      path,
      `Expected ${expected} from raw measured samples`,
    )
  }
}

function bootstrapOptionsFromSummary(value: unknown): BootstrapOptions {
  if (!isRecord(value) || !isRecord(value.confidenceInterval)) return {}
  const interval = value.confidenceInterval
  return {
    ...(typeof interval.level === 'number' &&
    Number.isFinite(interval.level) &&
    interval.level > 0 &&
    interval.level < 1
      ? { confidenceLevel: interval.level }
      : {}),
    ...(isNonNegativeSafeInteger(interval.resamples) && interval.resamples > 0
      ? { resamples: interval.resamples }
      : {}),
    ...(Number.isSafeInteger(interval.seed)
      ? { seed: interval.seed as number }
      : {}),
  }
}

function validateConfidenceInterval(
  actual: unknown,
  expected: BenchmarkDistributionSummaryV1['confidenceInterval'],
  path: string,
  issues: MutableValidationIssue[],
): void {
  if (!isRecord(actual)) {
    issue(
      issues,
      'summary-mismatch',
      path,
      'Expected a confidence interval derived from raw samples',
    )
    return
  }
  validateDerivedNumber(actual.level, expected.level, `${path}.level`, issues)
  validateDerivedNumber(actual.low, expected.low, `${path}.low`, issues)
  validateDerivedNumber(actual.high, expected.high, `${path}.high`, issues)
  if (actual.method !== expected.method) {
    issue(
      issues,
      'summary-mismatch',
      `${path}.method`,
      `Expected confidence method "${expected.method}"`,
    )
  }
  if (actual.resamples !== expected.resamples) {
    issue(
      issues,
      'summary-mismatch',
      `${path}.resamples`,
      `Expected ${expected.resamples} bootstrap resamples`,
    )
  }
  if (actual.seed !== expected.seed) {
    issue(
      issues,
      'summary-mismatch',
      `${path}.seed`,
      `Expected bootstrap seed ${expected.seed}`,
    )
  }
}

function validateDistributionSummary(
  actual: unknown,
  expected: BenchmarkDistributionSummaryV1,
  path: string,
  issues: MutableValidationIssue[],
): void {
  if (!isRecord(actual)) {
    issue(
      issues,
      'summary-mismatch',
      path,
      'Expected a distribution summary derived from raw measured samples',
    )
    return
  }
  if (actual.count !== expected.count) {
    issue(
      issues,
      'summary-mismatch',
      `${path}.count`,
      `Expected ${expected.count} valid measured samples`,
    )
  }
  for (const field of [
    'min',
    'max',
    'mean',
    'median',
    'p10',
    'p90',
    'mad',
  ] as const) {
    validateDerivedNumber(
      actual[field],
      expected[field],
      `${path}.${field}`,
      issues,
    )
  }
  if (expected.cv === undefined) {
    if (actual.cv !== undefined) {
      issue(
        issues,
        'summary-mismatch',
        `${path}.cv`,
        'Coefficient of variation is undefined for these raw samples',
      )
    }
  } else {
    validateDerivedNumber(actual.cv, expected.cv, `${path}.cv`, issues)
  }
  validateConfidenceInterval(
    actual.confidenceInterval,
    expected.confidenceInterval,
    `${path}.confidenceInterval`,
    issues,
  )
}

function validateCandidateSummaries(
  input: Record<string, unknown>,
  manifest: BenchmarkManifestV1,
  samples: readonly BenchmarkSampleV1[],
  issues: MutableValidationIssue[],
): void {
  if (!Array.isArray(input.candidates)) {
    issue(
      issues,
      'type',
      '$.candidates',
      'Expected an array of candidate summaries',
    )
    return
  }

  const summaries = new Map<
    string,
    { index: number; value: Record<string, unknown> }
  >()
  for (const [index, value] of input.candidates.entries()) {
    if (!isRecord(value) || !isNonEmptyString(value.candidateId)) {
      issue(
        issues,
        'summary-mismatch',
        `$.candidates[${index}]`,
        'Expected a candidate summary with a candidateId',
      )
      continue
    }
    if (summaries.has(value.candidateId)) {
      issue(
        issues,
        'duplicate-id',
        `$.candidates[${index}].candidateId`,
        `Candidate summary "${value.candidateId}" is duplicated`,
      )
      continue
    }
    summaries.set(value.candidateId, { index, value })
  }

  for (const candidate of manifest.candidates) {
    const stored = summaries.get(candidate.id)
    if (stored === undefined) {
      issue(
        issues,
        'summary-mismatch',
        '$.candidates',
        `Missing summary for candidate "${candidate.id}"`,
      )
      continue
    }
    const path = `$.candidates[${stored.index}]`
    const options = bootstrapOptionsFromSummary(stored.value.throughput)
    const expected = deriveBenchmarkCandidateSummary(
      candidate.id,
      samples,
      options,
    )
    if (stored.value.validSampleCount !== expected.validSampleCount) {
      issue(
        issues,
        'summary-mismatch',
        `${path}.validSampleCount`,
        `Expected ${expected.validSampleCount} valid measured samples`,
      )
    }
    if (stored.value.invalidSampleCount !== expected.invalidSampleCount) {
      issue(
        issues,
        'summary-mismatch',
        `${path}.invalidSampleCount`,
        `Expected ${expected.invalidSampleCount} invalid measured samples`,
      )
    }
    if (expected.throughput === undefined) {
      if (stored.value.throughput !== undefined) {
        issue(
          issues,
          'summary-mismatch',
          `${path}.throughput`,
          'No throughput summary is valid when no measured sample is valid',
        )
      }
    } else {
      validateDistributionSummary(
        stored.value.throughput,
        expected.throughput,
        `${path}.throughput`,
        issues,
      )
    }
  }

  const manifestCandidateIds = new Set(manifest.candidates.map(({ id }) => id))
  for (const [candidateId, stored] of summaries) {
    if (!manifestCandidateIds.has(candidateId)) {
      issue(
        issues,
        'summary-mismatch',
        `$.candidates[${stored.index}].candidateId`,
        `Unknown candidate summary "${candidateId}"`,
      )
    }
  }
}

function isCorrectnessStatus(
  value: unknown,
): value is BenchmarkComparisonSummaryV1['correctness'] {
  return value === 'failed' || value === 'not-checked' || value === 'passed'
}

function validateComparisonSummary(
  input: Record<string, unknown>,
  manifest: BenchmarkManifestV1,
  samples: readonly BenchmarkSampleV1[],
  issues: MutableValidationIssue[],
): void {
  if (manifest.mode === 'single') {
    if (input.comparison !== undefined) {
      issue(
        issues,
        'result-state',
        '$.comparison',
        'A single-candidate result cannot contain a comparison',
      )
    }
    return
  }

  const stored = input.comparison
  const correctness =
    isRecord(stored) && isCorrectnessStatus(stored.correctness)
      ? stored.correctness
      : 'not-checked'
  const expected = deriveBenchmarkComparison(manifest, samples, {
    ...bootstrapOptionsFromSummary(stored),
    correctness,
  })
  if (expected === undefined) {
    if (stored !== undefined) {
      issue(
        issues,
        'summary-mismatch',
        '$.comparison',
        'No paired valid measured samples exist for a comparison',
      )
    }
    return
  }
  if (!isRecord(stored)) {
    issue(
      issues,
      'summary-mismatch',
      '$.comparison',
      'Expected a comparison derived from paired measured samples',
    )
    return
  }
  if (!isCorrectnessStatus(stored.correctness)) {
    issue(
      issues,
      'summary-mismatch',
      '$.comparison.correctness',
      'Expected "failed", "not-checked", or "passed"',
    )
  }
  for (const field of [
    'baselineCandidateId',
    'candidateId',
    'verdict',
    'correctness',
  ] as const) {
    if (stored[field] !== expected[field]) {
      issue(
        issues,
        'summary-mismatch',
        `$.comparison.${field}`,
        `Expected "${expected[field]}" from paired measured samples`,
      )
    }
  }
  if (stored.pairedSampleCount !== expected.pairedSampleCount) {
    issue(
      issues,
      'summary-mismatch',
      '$.comparison.pairedSampleCount',
      `Expected ${expected.pairedSampleCount} paired measured samples`,
    )
  }
  if (!Array.isArray(stored.ratios)) {
    issue(
      issues,
      'summary-mismatch',
      '$.comparison.ratios',
      'Expected paired sample ratios',
    )
  } else {
    if (stored.ratios.length !== expected.ratios.length) {
      issue(
        issues,
        'summary-mismatch',
        '$.comparison.ratios',
        `Expected ${expected.ratios.length} paired ratios`,
      )
    }
    for (const [index, expectedRatio] of expected.ratios.entries()) {
      validateDerivedNumber(
        stored.ratios[index],
        expectedRatio,
        `$.comparison.ratios[${index}]`,
        issues,
      )
    }
  }
  for (const field of [
    'medianRatio',
    'geometricMeanRatio',
    'percentChange',
  ] as const) {
    validateDerivedNumber(
      stored[field],
      expected[field],
      `$.comparison.${field}`,
      issues,
    )
  }
  validateConfidenceInterval(
    stored.confidenceInterval,
    expected.confidenceInterval,
    '$.comparison.confidenceInterval',
    issues,
  )
}

export function validateBenchmarkResult(
  input: unknown,
  manifest?: BenchmarkManifestV1,
): BenchmarkValidationV1 {
  const issues: MutableValidationIssue[] = []
  if (!validateCommonEnvelope(input, BENCHMARK_RESULT_SCHEMA_VERSION, issues)) {
    return finishValidation(issues)
  }

  if (!hasIsoDate(input.startedAt)) {
    issue(
      issues,
      'invalid-date',
      '$.startedAt',
      'Expected an ISO-compatible timestamp',
    )
  }
  if (input.completedAt !== undefined && !hasIsoDate(input.completedAt)) {
    issue(
      issues,
      'invalid-date',
      '$.completedAt',
      'Expected an ISO-compatible timestamp',
    )
  }
  const terminalStatuses = new Set([
    'cancelled',
    'completed',
    'failed',
    'invalid',
  ])
  const knownStatuses = new Set([
    ...terminalStatuses,
    'preparing',
    'queued',
    'running',
    'warming-up',
  ])
  if (!knownStatuses.has(String(input.status))) {
    issue(
      issues,
      'invalid-status',
      '$.status',
      'Expected a recognized benchmark run status',
    )
  }
  if (
    terminalStatuses.has(String(input.status)) &&
    input.completedAt === undefined
  ) {
    issue(
      issues,
      'result-state',
      '$.completedAt',
      'A terminal result must include its completion time',
    )
  }
  if (manifest !== undefined && input.manifestId !== manifest.id) {
    issue(
      issues,
      'candidate-id',
      '$.manifestId',
      'Result belongs to a different manifest',
    )
  }

  const validatedSamples: BenchmarkSampleV1[] = []
  let hasExactScheduleCoverage = false
  if (!Array.isArray(input.samples)) {
    issue(issues, 'type', '$.samples', 'Expected an array of samples')
  } else {
    const sampleIds = new Set<string>()
    const sequences = new Set<number>()
    for (const [index, sample] of input.samples.entries()) {
      const report = validateBenchmarkSample(sample, manifest)
      if (report.status !== 'invalid') {
        validatedSamples.push(sample as BenchmarkSampleV1)
      }
      for (const sampleIssue of report.issues) {
        issues.push({
          ...sampleIssue,
          path: `$.samples[${index}]${sampleIssue.path.slice(1)}`,
        })
      }
      if (isRecord(sample) && isNonEmptyString(sample.id)) {
        if (sampleIds.has(sample.id)) {
          issue(
            issues,
            'duplicate-id',
            `$.samples[${index}].id`,
            `Sample id "${sample.id}" is duplicated`,
          )
        }
        sampleIds.add(sample.id)
      }
      if (isRecord(sample) && sample.runId !== input.id) {
        issue(
          issues,
          'result-state',
          `$.samples[${index}].runId`,
          'Sample belongs to a different benchmark result',
        )
      }
      if (isRecord(sample) && isNonNegativeSafeInteger(sample.sequence)) {
        if (sequences.has(sample.sequence)) {
          issue(
            issues,
            'schedule-entry',
            `$.samples[${index}].sequence`,
            `Sample sequence ${sample.sequence} is duplicated`,
          )
        }
        sequences.add(sample.sequence)
      }
    }

    if (manifest !== undefined) {
      const missingSequences = manifest.schedule
        .map(({ sequence }) => sequence)
        .filter((sequence) => !sequences.has(sequence))
      hasExactScheduleCoverage =
        input.samples.length === manifest.schedule.length &&
        missingSequences.length === 0 &&
        sequences.size === manifest.schedule.length
      if (!hasExactScheduleCoverage) {
        issue(
          issues,
          'sample-coverage',
          '$.samples',
          `Expected exactly ${manifest.schedule.length} samples covering every manifest schedule sequence${
            missingSequences.length > 0
              ? `; missing ${missingSequences.join(', ')}`
              : ''
          }`,
        )
      }
    }
  }

  if (
    manifest !== undefined &&
    hasExactScheduleCoverage &&
    Array.isArray(input.samples) &&
    validatedSamples.length === input.samples.length
  ) {
    validateCandidateSummaries(input, manifest, validatedSamples, issues)
    validateComparisonSummary(input, manifest, validatedSamples, issues)
  } else if (manifest?.mode === 'single' && input.comparison !== undefined) {
    issue(
      issues,
      'result-state',
      '$.comparison',
      'A single-candidate result cannot contain a comparison',
    )
  }

  return finishValidation(issues)
}

export function isBenchmarkResultV1(
  input: unknown,
  manifest?: BenchmarkManifestV1,
): input is BenchmarkResultV1 {
  return validateBenchmarkResult(input, manifest).status !== 'invalid'
}
