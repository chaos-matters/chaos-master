import { describe, expect, it } from 'vitest'
import { BENCHMARK_MANIFEST_SCHEMA_VERSION, BENCHMARK_RESULT_SCHEMA_VERSION, BENCHMARK_SAMPLE_SCHEMA_VERSION, } from './model'
import { deriveBenchmarkCandidateSummaries, deriveBenchmarkComparison, } from './resultSummary'
import { createBalancedComparisonSchedule } from './schedule'
import { validateBenchmarkManifest, validateBenchmarkResult, validateBenchmarkSample, } from './validation'
import type { BenchmarkManifestV1, BenchmarkResultV1, BenchmarkSampleV1, } from './model'

function makeManifest(): BenchmarkManifestV1 {
  return {
    schemaVersion: BENCHMARK_MANIFEST_SCHEMA_VERSION,
    id: 'manifest-1',
    createdAt: '2026-07-30T12:00:00.000Z',
    appVersion: '0.9.8',
    buildId: 'test-build',
    mode: 'comparison',
    environment: {
      kind: 'local-webgpu',
      executorId: 'browser',
      requestedFeatures: [],
      metadata: {},
    },
    protocol: {
      id: 'lab-v1',
      timingMode: 'queue-fenced-wall-clock',
      warmupPairs: 1,
      measuredPairs: 2,
      workBudget: { kind: 'fixed-work', workUnits: 1_000_000 },
      metric: {
        id: 'throughput',
        label: 'Points per second',
        unit: 'points/s',
        direction: 'higher-is-better',
      },
      compilation: 'reported-separately',
    },
    workload: {
      id: 'example',
      label: 'Example',
      flame: {
        id: 'flame',
        label: 'Benchmark flame',
        source: 'builtin',
        digest: 'sha256:test',
      },
      width: 1_024,
      height: 1_024,
      pointCount: 1_000_000,
      deterministicSeed: 42,
      settings: {},
    },
    candidates: [
      {
        id: 'baseline',
        label: 'Current',
        role: 'baseline',
        implementations: [],
        metadata: {},
      },
      {
        id: 'candidate',
        label: 'Optimized',
        role: 'candidate',
        implementations: [],
        metadata: {},
      },
    ],
    schedule: createBalancedComparisonSchedule({
      baselineCandidateId: 'baseline',
      candidateId: 'candidate',
      warmupPairs: 1,
      measuredPairs: 2,
    }),
    metadata: {},
  }
}

function makeSample(
  manifest: BenchmarkManifestV1,
  sequence = 0,
): BenchmarkSampleV1 {
  const scheduled = manifest.schedule[sequence]!
  return {
    schemaVersion: BENCHMARK_SAMPLE_SCHEMA_VERSION,
    id: `sample-${sequence}`,
    runId: 'run-1',
    manifestId: manifest.id,
    sequence,
    phase: scheduled.phase,
    pairIndex: scheduled.pairIndex,
    orderInPair: scheduled.orderInPair,
    candidateId: scheduled.candidateId,
    status: 'valid',
    startedAt: '2026-07-30T12:00:01.000Z',
    timingMode: manifest.protocol.timingMode,
    elapsedMs: 100,
    completedWork: 1_000,
    throughput: 10_000,
    invalidReasons: [],
    metadata: {},
  }
}

function makeResult(manifest: BenchmarkManifestV1): BenchmarkResultV1 {
  const samples = manifest.schedule.map(({ sequence }) =>
    makeSample(manifest, sequence),
  )
  const comparison = deriveBenchmarkComparison(manifest, samples)
  return {
    schemaVersion: BENCHMARK_RESULT_SCHEMA_VERSION,
    id: 'run-1',
    manifestId: manifest.id,
    status: 'completed',
    startedAt: '2026-07-30T12:00:00.000Z',
    completedAt: '2026-07-30T12:00:05.000Z',
    device: {
      adapter: 'Test GPU',
      features: [],
      metadata: {},
    },
    compilation: [],
    samples,
    candidates: deriveBenchmarkCandidateSummaries(manifest, samples),
    ...(comparison === undefined ? {} : { comparison }),
    validation: { status: 'valid', issues: [] },
    metadata: {},
  }
}

describe('validateBenchmarkManifest', () => {
  it('accepts a coherent versioned comparison manifest', () => {
    expect(validateBenchmarkManifest(makeManifest())).toEqual({
      status: 'valid',
      issues: [],
    })
  })

  it('rejects unsupported schema versions and repeated AB ordering', () => {
    const manifest = makeManifest()
    const malformed = {
      ...manifest,
      schemaVersion: 'chaos-benchmark-manifest/v99',
      schedule: manifest.schedule.map((entry) =>
        entry.phase === 'measured'
          ? {
              ...entry,
              blockOrder: 'AB',
              candidateId: entry.orderInPair === 0 ? 'baseline' : 'candidate',
            }
          : entry,
      ),
    }
    const report = validateBenchmarkManifest(malformed)

    expect(report.status).toBe('invalid')
    expect(report.issues.map(({ code }) => code)).toContain('schema-version')
    expect(report.issues.map(({ code }) => code)).toContain('schedule-order')
  })

  it('rejects a result containing a sample from a different run', () => {
    const manifest = makeManifest()
    const result = {
      schemaVersion: BENCHMARK_RESULT_SCHEMA_VERSION,
      id: 'run-2',
      manifestId: manifest.id,
      status: 'completed',
      startedAt: '2026-07-30T12:00:00.000Z',
      completedAt: '2026-07-30T12:00:05.000Z',
      device: {
        adapter: 'Test GPU',
        features: [],
        metadata: {},
      },
      compilation: [],
      samples: [makeSample(manifest)],
      candidates: [],
      validation: { status: 'valid', issues: [] },
      metadata: {},
    }

    expect(validateBenchmarkResult(result, manifest).issues).toContainEqual(
      expect.objectContaining({
        path: '$.samples[0].runId',
        severity: 'error',
      }),
    )
  })

  it('rejects duplicate candidate ids and protocol count mismatches', () => {
    const manifest = makeManifest()
    const malformed = {
      ...manifest,
      protocol: { ...manifest.protocol, measuredPairs: 3 },
      candidates: [
        manifest.candidates[0],
        { ...manifest.candidates[1], id: 'baseline' },
      ],
    }
    const report = validateBenchmarkManifest(malformed)

    expect(report.status).toBe('invalid')
    expect(report.issues.map(({ code }) => code)).toContain('duplicate-id')
    expect(report.issues.map(({ code }) => code)).toContain('schedule-count')
  })

  it('accepts legacy and hybrid work budgets', () => {
    const manifest = makeManifest()
    for (const workBudget of [
      { kind: 'fixed-work', workUnits: 1_000_000 },
      { kind: 'fixed-duration', durationMs: 2_000 },
      {
        kind: 'minimum-work-and-duration',
        workUnits: 1_000_000,
        durationMs: 2_000,
      },
    ] as const) {
      expect(
        validateBenchmarkManifest({
          ...manifest,
          protocol: { ...manifest.protocol, workBudget },
        }).status,
      ).toBe('valid')
    }
  })

  it('requires both hybrid work-budget minimums to be positive', () => {
    const manifest = makeManifest()
    const report = validateBenchmarkManifest({
      ...manifest,
      protocol: {
        ...manifest.protocol,
        workBudget: {
          kind: 'minimum-work-and-duration',
          workUnits: 0,
          durationMs: Number.NaN,
        },
      },
    })

    expect(report.status).toBe('invalid')
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.protocol.workBudget.workUnits',
        }),
        expect.objectContaining({
          path: '$.protocol.workBudget.durationMs',
        }),
      ]),
    )
  })
})

describe('validateBenchmarkSample', () => {
  it('accepts a valid sample that matches its scheduled slot', () => {
    const manifest = makeManifest()
    expect(validateBenchmarkSample(makeSample(manifest), manifest)).toEqual({
      status: 'valid',
      issues: [],
    })
  })

  it('warns when the derived throughput differs from the reported value', () => {
    const manifest = makeManifest()
    const sample = { ...makeSample(manifest), throughput: 12_000 }
    const report = validateBenchmarkSample(sample, manifest)

    expect(report.status).toBe('warning')
    expect(report.issues).toEqual([
      expect.objectContaining({
        code: 'metric-mismatch',
        severity: 'warning',
      }),
    ])
  })

  it('rejects invalid samples without reasons and schedule mismatches', () => {
    const manifest = makeManifest()
    const sample = {
      ...makeSample(manifest),
      candidateId: 'candidate',
      status: 'invalid',
      elapsedMs: null,
      completedWork: null,
      throughput: null,
    }
    const report = validateBenchmarkSample(sample, manifest)

    expect(report.status).toBe('invalid')
    expect(report.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['result-state', 'schedule-entry']),
    )
  })
})

describe('validateBenchmarkResult', () => {
  it('accepts complete results whose summaries derive from raw samples', () => {
    const manifest = makeManifest()
    expect(validateBenchmarkResult(makeResult(manifest), manifest)).toEqual({
      status: 'valid',
      issues: [],
    })
  })

  it('rejects an unknown run status', () => {
    const manifest = makeManifest()
    const report = validateBenchmarkResult(
      { ...makeResult(manifest), status: 'done-ish' },
      manifest,
    )

    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: 'invalid-status',
        path: '$.status',
      }),
    )
  })

  it('requires every manifest schedule sequence exactly once', () => {
    const manifest = makeManifest()
    const result = makeResult(manifest)
    const incomplete = {
      ...result,
      samples: result.samples.slice(0, -1),
    }
    const report = validateBenchmarkResult(incomplete, manifest)

    expect(report.status).toBe('invalid')
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: 'sample-coverage',
        path: '$.samples',
      }),
    )
  })

  it('requires every sample to belong to the enclosing result', () => {
    const manifest = makeManifest()
    const result = makeResult(manifest)
    const wrongRun = {
      ...result,
      samples: result.samples.map((sample, index) =>
        index === 0 ? { ...sample, runId: 'another-run' } : sample,
      ),
    }
    const report = validateBenchmarkResult(wrongRun, manifest)

    expect(report.status).toBe('invalid')
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        path: '$.samples[0].runId',
        severity: 'error',
      }),
    )
  })

  it('rejects candidate and comparison headlines that disagree with raw samples', () => {
    const manifest = makeManifest()
    const result = makeResult(manifest)
    const firstSummary = result.candidates[0]!
    const comparison = result.comparison!
    const corrupted = {
      ...result,
      candidates: [
        {
          ...firstSummary,
          validSampleCount: firstSummary.validSampleCount + 1,
          throughput: {
            ...firstSummary.throughput!,
            median: firstSummary.throughput!.median + 100,
          },
        },
        result.candidates[1]!,
      ],
      comparison: {
        ...comparison,
        geometricMeanRatio: comparison.geometricMeanRatio + 0.5,
      },
    }
    const report = validateBenchmarkResult(corrupted, manifest)

    expect(report.status).toBe('invalid')
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'summary-mismatch',
          path: '$.candidates[0].validSampleCount',
        }),
        expect.objectContaining({
          code: 'summary-mismatch',
          path: '$.candidates[0].throughput.median',
        }),
        expect.objectContaining({
          code: 'summary-mismatch',
          path: '$.comparison.geometricMeanRatio',
        }),
      ]),
    )
  })

  it('rejects duplicate sample ids and sequences', () => {
    const manifest = makeManifest()
    const sample = makeSample(manifest)
    const result: BenchmarkResultV1 = {
      schemaVersion: BENCHMARK_RESULT_SCHEMA_VERSION,
      id: 'run-1',
      manifestId: manifest.id,
      status: 'completed',
      startedAt: '2026-07-30T12:00:00.000Z',
      completedAt: '2026-07-30T12:00:05.000Z',
      device: {
        adapter: 'Test GPU',
        features: [],
        metadata: {},
      },
      compilation: [],
      samples: [sample, sample],
      candidates: [],
      validation: { status: 'valid', issues: [] },
      metadata: {},
    }
    const report = validateBenchmarkResult(result, manifest)

    expect(report.status).toBe('invalid')
    expect(report.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['duplicate-id', 'schedule-entry']),
    )
  })
})
