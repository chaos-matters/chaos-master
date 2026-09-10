import { describe, expect, it } from 'vitest'
import { BENCHMARK_MANIFEST_SCHEMA_VERSION, BENCHMARK_SAMPLE_SCHEMA_VERSION, createBalancedComparisonSchedule, createSingleCandidateSchedule, } from '@/benchmarks'
import { buildBenchmarkDeviceReport, buildBenchmarkResult, evaluateComparisonSignatures, resolveBenchmarkMetadata, signatureLooksRendered, } from './benchmarkResultBuilder'
import type { BenchmarkCompilationV1, BenchmarkManifestV1, BenchmarkSampleV1, } from '@/benchmarks'

function createTestManifest(
  mode: 'comparison' | 'single',
): BenchmarkManifestV1 {
  const common = {
    schemaVersion: BENCHMARK_MANIFEST_SCHEMA_VERSION,
    id: 'test-manifest-1',
    createdAt: '2026-09-10T10:00:00.000Z',
    appVersion: '0.9.8',
    buildId: 'test-build',
    environment: {
      kind: 'local-webgpu' as const,
      executorId: 'browser',
      requestedFeatures: [],
      metadata: {},
    },
    protocol: {
      id: 'lab-v1',
      timingMode: 'queue-fenced-wall-clock' as const,
      warmupPairs: 1,
      measuredPairs: 2,
      workBudget: { kind: 'fixed-work' as const, workUnits: 1_000_000 },
      metric: {
        id: 'throughput',
        label: 'Points per second',
        unit: 'points/s',
        direction: 'higher-is-better' as const,
      },
      compilation: 'reported-separately' as const,
    },
    workload: {
      id: 'example',
      label: 'Example Workload',
      flame: {
        id: 'builtin:example',
        label: 'Benchmark Flame',
        source: 'builtin' as const,
        digest: 'cm-flame-v1:test',
      },
      width: 1024,
      height: 1024,
      pointCount: 1_000_000,
      deterministicSeed: 42,
      settings: {},
    },
    metadata: {},
  }

  if (mode === 'comparison') {
    return {
      ...common,
      mode: 'comparison',
      candidates: [
        {
          id: 'baseline-cand',
          label: 'Baseline',
          role: 'baseline',
          implementations: [],
          metadata: {},
        },
        {
          id: 'optimized-cand',
          label: 'Optimized',
          role: 'candidate',
          implementations: [],
          metadata: {},
        },
      ],
      schedule: createBalancedComparisonSchedule({
        baselineCandidateId: 'baseline-cand',
        candidateId: 'optimized-cand',
        warmupPairs: 1,
        measuredPairs: 2,
      }),
    }
  }

  return {
    ...common,
    mode: 'single',
    candidates: [
      {
        id: 'single-cand',
        label: 'Single Candidate',
        role: 'baseline',
        implementations: [],
        metadata: {},
      },
    ],
    schedule: createSingleCandidateSchedule({
      candidateId: 'single-cand',
      warmupSamples: 1,
      measuredSamples: 2,
    }),
  }
}

function createTestSamples(
  manifest: BenchmarkManifestV1,
  runId: string,
): BenchmarkSampleV1[] {
  return manifest.schedule.map((entry) => ({
    schemaVersion: BENCHMARK_SAMPLE_SCHEMA_VERSION,
    id: `${runId}-sample-${entry.sequence}`,
    runId,
    manifestId: manifest.id,
    sequence: entry.sequence,
    phase: entry.phase,
    pairIndex: entry.pairIndex,
    orderInPair: entry.orderInPair,
    candidateId: entry.candidateId,
    status: 'valid',
    startedAt: '2026-09-10T10:00:01.000Z',
    timingMode: 'queue-fenced-wall-clock',
    elapsedMs: 50,
    completedWork: 50_000_000,
    throughput: 1_000_000_000,
    invalidReasons: [],
    metadata: {
      blockOrder: entry.blockOrder,
      signatureCaptured: true,
    },
  }))
}

describe('benchmarkResultBuilder', () => {
  describe('signatureLooksRendered', () => {
    it('returns false for empty signatures', () => {
      expect(signatureLooksRendered([])).toBe(false)
    })

    it('returns false if insufficient lit elements or values too low', () => {
      expect(signatureLooksRendered([[0, 0, 0, 0]])).toBe(false)
      expect(signatureLooksRendered([[2, 0, 0, 0]])).toBe(false)
      expect(signatureLooksRendered([[2, 3, 0, 0]])).toBe(false) // max is 3, not > 4
    })

    it('returns true when at least 2 elements > 1 and max > 4', () => {
      expect(signatureLooksRendered([[2, 5, 0, 0]])).toBe(true)
      expect(
        signatureLooksRendered([
          [0, 0, 0, 0],
          [10, 20, 0, 0],
        ]),
      ).toBe(true)
    })
  })

  describe('evaluateComparisonSignatures', () => {
    it('returns not-checked for single candidate manifest', () => {
      const manifest = createTestManifest('single')
      const signatures = new Map<string, (readonly number[])[]>()
      expect(evaluateComparisonSignatures(manifest, signatures)).toBe(
        'not-checked',
      )
    })

    it('returns not-checked if either candidate has no signatures', () => {
      const manifest = createTestManifest('comparison')
      const signatures = new Map<string, (readonly number[])[]>([
        ['baseline-cand', [[5, 5, 0, 0]]],
      ])
      expect(evaluateComparisonSignatures(manifest, signatures)).toBe(
        'not-checked',
      )
    })

    it('returns passed when both candidates look rendered', () => {
      const manifest = createTestManifest('comparison')
      const signatures = new Map<string, (readonly number[])[]>([
        ['baseline-cand', [[5, 10, 0, 0]]],
        ['optimized-cand', [[6, 12, 0, 0]]],
      ])
      expect(evaluateComparisonSignatures(manifest, signatures)).toBe('passed')
    })

    it('returns failed when one candidate has blank signatures', () => {
      const manifest = createTestManifest('comparison')
      const signatures = new Map<string, (readonly number[])[]>([
        ['baseline-cand', [[5, 10, 0, 0]]],
        ['optimized-cand', [[0, 0, 0, 0]]],
      ])
      expect(evaluateComparisonSignatures(manifest, signatures)).toBe('failed')
    })
  })

  describe('buildBenchmarkDeviceReport', () => {
    it('handles missing adapter and device gracefully', () => {
      const report = buildBenchmarkDeviceReport(null, null)
      expect(report.adapter).toBe('WebGPU adapter')
      expect(report.features).toEqual([])
      expect(report.metadata.maxBufferSize).toBe(0)
    })

    it('extracts info from mock adapter and device', () => {
      const mockAdapter = {
        info: {
          description: 'NVIDIA RTX 4090',
          vendor: 'nvidia',
          architecture: 'ada',
        },
      } as unknown as GPUAdapter

      const mockDevice = {
        features: new Set(['shader-f16', 'timestamp-query']),
        limits: {
          maxBufferSize: 1024 * 1024 * 1024,
        },
      } as unknown as GPUDevice

      const report = buildBenchmarkDeviceReport(mockAdapter, mockDevice)
      expect(report.adapter).toBe('NVIDIA RTX 4090')
      expect(report.vendor).toBe('nvidia')
      expect(report.architecture).toBe('ada')
      expect(report.features).toEqual(['shader-f16', 'timestamp-query'])
      expect(report.metadata.maxBufferSize).toBe(1024 * 1024 * 1024)
    })
  })

  describe('resolveBenchmarkMetadata', () => {
    it('resolves metadata for comparison with custom lab enabled', () => {
      const manifest = createTestManifest('comparison')
      const meta = resolveBenchmarkMetadata(manifest, true)
      expect(meta.runner).toBe('lab-v1')
      expect(meta.correctnessMethod).toBe('nonblank-render-smoke/v1')
      expect(meta.correctnessScope).toBe(
        'safe-compile-and-nonblank-render-smoke',
      )
    })

    it('resolves metadata for comparison with standard lab', () => {
      const manifest = createTestManifest('comparison')
      const meta = resolveBenchmarkMetadata(manifest, false)
      expect(meta.correctnessMethod).toBe('nonblank-render-smoke/v1')
      expect(meta.correctnessScope).toBe('nonblank-render-smoke')
    })

    it('resolves metadata for single candidate run', () => {
      const manifest = createTestManifest('single')
      const meta = resolveBenchmarkMetadata(manifest, false)
      expect(meta.correctnessMethod).toBe('not-checked')
      expect(meta.correctnessScope).toBe('not-checked')
    })
  })

  describe('buildBenchmarkResult', () => {
    it('builds a valid single-candidate result', () => {
      const manifest = createTestManifest('single')
      const samples = createTestSamples(manifest, 'result-single-1')
      const compilation: BenchmarkCompilationV1[] = [
        {
          candidateId: 'single-cand',
          status: 'ready',
          elapsedMs: null,
          message: 'Ready',
        },
      ]
      const signatures = new Map<string, (readonly number[])[]>()

      const result = buildBenchmarkResult({
        resultId: 'result-single-1',
        manifest,
        samples,
        compilation,
        signatures,
        startedAt: '2026-09-10T10:00:00.000Z',
      })

      expect(result.status).toBe('completed')
      expect(result.validation.status).toBe('valid')
      expect(result.candidates).toHaveLength(1)
      expect(result.comparison).toBeUndefined()
      expect(result.metadata.correctnessMethod).toBe('not-checked')
    })

    it('builds a valid comparison result with passed correctness', () => {
      const manifest = createTestManifest('comparison')
      const samples = createTestSamples(manifest, 'result-comp-1')
      const compilation: BenchmarkCompilationV1[] = [
        {
          candidateId: 'baseline-cand',
          status: 'ready',
          elapsedMs: null,
          message: 'Ready',
        },
        {
          candidateId: 'optimized-cand',
          status: 'ready',
          elapsedMs: null,
          message: 'Ready',
        },
      ]
      const signatures = new Map<string, (readonly number[])[]>([
        ['baseline-cand', [[10, 20, 0, 0]]],
        ['optimized-cand', [[10, 20, 0, 0]]],
      ])

      const result = buildBenchmarkResult({
        resultId: 'result-comp-1',
        manifest,
        samples,
        compilation,
        signatures,
        startedAt: '2026-09-10T10:00:00.000Z',
      })

      expect(result.status).toBe('completed')
      expect(result.validation.status).toBe('valid')
      expect(result.candidates).toHaveLength(2)
      expect(result.comparison).toBeDefined()
      expect(result.comparison?.correctness).toBe('passed')
    })

    it('marks comparison correctness as failed if signature check fails', () => {
      const manifest = createTestManifest('comparison')
      const samples = createTestSamples(manifest, 'result-comp-2')
      const compilation: BenchmarkCompilationV1[] = [
        {
          candidateId: 'baseline-cand',
          status: 'ready',
          elapsedMs: null,
          message: 'Ready',
        },
        {
          candidateId: 'optimized-cand',
          status: 'ready',
          elapsedMs: null,
          message: 'Ready',
        },
      ]
      const signatures = new Map<string, (readonly number[])[]>([
        ['baseline-cand', [[10, 20, 0, 0]]],
        ['optimized-cand', [[0, 0, 0, 0]]],
      ])

      const result = buildBenchmarkResult({
        resultId: 'result-comp-2',
        manifest,
        samples,
        compilation,
        signatures,
        startedAt: '2026-09-10T10:00:00.000Z',
      })

      expect(result.status).toBe('completed')
      expect(result.comparison?.correctness).toBe('failed')
    })
  })
})
