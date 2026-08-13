import type { BenchmarkManifestV1, BenchmarkResultV1, BenchmarkSampleV1, } from './model'

export const BENCHMARK_EXPORT_SCHEMA_VERSION =
  'chaos-benchmark-export/v1' as const

export interface BenchmarkExportV1 {
  readonly schemaVersion: typeof BENCHMARK_EXPORT_SCHEMA_VERSION
  readonly exportedAt: string
  readonly manifest: BenchmarkManifestV1
  readonly result: BenchmarkResultV1
}

export interface BenchmarkTextExport {
  readonly filename: string
  readonly mimeType: string
  readonly text: string
}

export interface BenchmarkExportOptions {
  readonly exportedAt?: string
  readonly filenameBase?: string
}

const CSV_HEADERS = [
  'run_id',
  'manifest_id',
  'run_status',
  'app_version',
  'build_id',
  'environment',
  'executor_id',
  'workload_id',
  'flame_id',
  'flame_label',
  'flame_source',
  'flame_digest',
  'candidate_id',
  'candidate_label',
  'candidate_role',
  'sequence',
  'phase',
  'pair_index',
  'order_in_pair',
  'sample_status',
  'timing_mode',
  'elapsed_ms',
  'completed_work',
  'throughput',
  'invalid_reasons',
  'sample_started_at',
  'comparison_verdict',
  'geometric_mean_ratio',
  'percent_change',
  'confidence_low',
  'confidence_high',
] as const

function assertMatchingPair(
  manifest: BenchmarkManifestV1,
  result: BenchmarkResultV1,
): void {
  if (result.manifestId !== manifest.id) {
    throw new RangeError('Result and manifest ids do not match')
  }
}

function filenameBase(
  manifest: BenchmarkManifestV1,
  options: BenchmarkExportOptions,
): string {
  const requested =
    options.filenameBase?.trim() || `chaos-benchmark-${manifest.id}`
  const sanitized = requested
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
  return sanitized || 'chaos-benchmark'
}

function exportedAt(options: BenchmarkExportOptions): string {
  const value = options.exportedAt ?? new Date().toISOString()
  if (!Number.isFinite(Date.parse(value))) {
    throw new RangeError('exportedAt must be an ISO-compatible timestamp')
  }
  return value
}

export function createBenchmarkJsonExport(
  manifest: BenchmarkManifestV1,
  result: BenchmarkResultV1,
  options: BenchmarkExportOptions = {},
): BenchmarkTextExport {
  assertMatchingPair(manifest, result)
  const bundle: BenchmarkExportV1 = {
    schemaVersion: BENCHMARK_EXPORT_SCHEMA_VERSION,
    exportedAt: exportedAt(options),
    manifest,
    result,
  }
  return {
    filename: `${filenameBase(manifest, options)}.json`,
    mimeType: 'application/json;charset=utf-8',
    text: `${JSON.stringify(bundle, null, 2)}\n`,
  }
}

function spreadsheetSafe(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

function csvCell(value: number | string | null | undefined): string {
  if (value === undefined || value === null) return ''
  const text = spreadsheetSafe(String(value))
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function sampleRow(
  manifest: BenchmarkManifestV1,
  result: BenchmarkResultV1,
  sample: BenchmarkSampleV1,
): readonly (number | string | null | undefined)[] {
  const candidate = manifest.candidates.find(
    ({ id }) => id === sample.candidateId,
  )
  const comparison = result.comparison
  return [
    result.id,
    manifest.id,
    result.status,
    manifest.appVersion,
    manifest.buildId,
    manifest.environment.kind,
    manifest.environment.executorId,
    manifest.workload.id,
    manifest.workload.flame.id,
    manifest.workload.flame.label,
    manifest.workload.flame.source,
    manifest.workload.flame.digest,
    sample.candidateId,
    candidate?.label,
    candidate?.role,
    sample.sequence,
    sample.phase,
    sample.pairIndex,
    sample.orderInPair,
    sample.status,
    sample.timingMode,
    sample.elapsedMs,
    sample.completedWork,
    sample.throughput,
    sample.invalidReasons.join('|'),
    sample.startedAt,
    comparison?.verdict,
    comparison?.geometricMeanRatio,
    comparison?.percentChange,
    comparison?.confidenceInterval.low,
    comparison?.confidenceInterval.high,
  ]
}

/**
 * Long-form sample export: one row per raw sample with the immutable manifest
 * identity and comparison summary repeated for straightforward filtering and
 * analysis in spreadsheets, R, or Python.
 */
export function createBenchmarkCsvExport(
  manifest: BenchmarkManifestV1,
  result: BenchmarkResultV1,
  options: BenchmarkExportOptions = {},
): BenchmarkTextExport {
  assertMatchingPair(manifest, result)
  const rows = [
    CSV_HEADERS.map(csvCell).join(','),
    ...result.samples.map((sample) =>
      sampleRow(manifest, result, sample).map(csvCell).join(','),
    ),
  ]
  return {
    filename: `${filenameBase(manifest, options)}.csv`,
    mimeType: 'text/csv;charset=utf-8',
    text: `${rows.join('\r\n')}\r\n`,
  }
}
