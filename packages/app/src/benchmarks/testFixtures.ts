import { BENCHMARK_MANIFEST_SCHEMA_VERSION, BENCHMARK_RESULT_SCHEMA_VERSION, BENCHMARK_SAMPLE_SCHEMA_VERSION, } from './model'
import { deriveBenchmarkCandidateSummaries, deriveBenchmarkComparison, } from './resultSummary'
import { createBalancedComparisonSchedule } from './schedule'
import type { BenchmarkManifestV1, BenchmarkResultV1, BenchmarkRunStatus, BenchmarkSampleV1, } from './model'

export function createTestBenchmarkManifest(
  id = 'manifest-1',
): BenchmarkManifestV1 {
  return {
    schemaVersion: BENCHMARK_MANIFEST_SCHEMA_VERSION,
    id,
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
        id: 'builtin:example',
        label: 'Benchmark flame',
        source: 'builtin',
        digest: 'cm-flame-v1:test',
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

export function createTestBenchmarkSample(
  manifest: BenchmarkManifestV1,
  runId: string,
  sequence = 0,
): BenchmarkSampleV1 {
  const scheduled = manifest.schedule[sequence]!
  const baselineThroughput = 10_000 + scheduled.pairIndex * 100
  const throughput =
    scheduled.candidateId === manifest.candidates[0].id
      ? baselineThroughput
      : baselineThroughput * 1.2
  return {
    schemaVersion: BENCHMARK_SAMPLE_SCHEMA_VERSION,
    id: `${runId}-sample-${sequence}`,
    runId,
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
    completedWork: throughput / 10,
    throughput,
    invalidReasons: [],
    metadata: {},
  }
}

export function createTestBenchmarkResult(
  manifest: BenchmarkManifestV1,
  id = 'run-1',
  status: BenchmarkRunStatus = 'completed',
): BenchmarkResultV1 {
  const samples = manifest.schedule.map(({ sequence }) =>
    createTestBenchmarkSample(manifest, id, sequence),
  )
  const comparison = deriveBenchmarkComparison(manifest, samples, {
    correctness: 'not-checked',
  })
  return {
    schemaVersion: BENCHMARK_RESULT_SCHEMA_VERSION,
    id,
    manifestId: manifest.id,
    status,
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
