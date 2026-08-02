import { describe, expect, it } from 'vitest'
import { BENCHMARK_EXPORT_SCHEMA_VERSION, createBenchmarkCsvExport, createBenchmarkJsonExport, } from './export'
import { createTestBenchmarkManifest, createTestBenchmarkResult, } from './testFixtures'

describe('benchmark exports', () => {
  it('creates a self-contained, versioned JSON export', () => {
    const manifest = createTestBenchmarkManifest()
    const result = createTestBenchmarkResult(manifest)
    const exported = createBenchmarkJsonExport(manifest, result, {
      exportedAt: '2026-07-30T14:00:00.000Z',
      filenameBase: 'Chaos run / 82',
    })

    expect(exported.filename).toBe('Chaos-run-82.json')
    expect(exported.mimeType).toBe('application/json;charset=utf-8')
    expect(JSON.parse(exported.text)).toMatchObject({
      schemaVersion: BENCHMARK_EXPORT_SCHEMA_VERSION,
      exportedAt: '2026-07-30T14:00:00.000Z',
      manifest: { id: manifest.id },
      result: { id: result.id },
    })
  })

  it('creates long-form CRLF CSV and neutralizes spreadsheet formulas', () => {
    const original = createTestBenchmarkManifest()
    const manifest = {
      ...original,
      workload: {
        ...original.workload,
        flame: {
          ...original.workload.flame,
          label: '=SUM(1,2)',
        },
      },
      candidates: [
        original.candidates[0],
        {
          ...original.candidates[1],
          label: 'Optimized, "fast"',
        },
      ],
    } as typeof original
    const result = createTestBenchmarkResult(manifest)
    const exported = createBenchmarkCsvExport(manifest, result)
    const lines = exported.text.trimEnd().split('\r\n')

    expect(exported.filename).toBe(`chaos-benchmark-${manifest.id}.csv`)
    expect(exported.mimeType).toBe('text/csv;charset=utf-8')
    expect(lines).toHaveLength(1 + manifest.schedule.length)
    expect(lines[0]).toContain('run_id,manifest_id,run_status')
    expect(lines[1]).toContain(`"'=SUM(1,2)"`)
    expect(lines[1]).toContain(',100,1000,10000,')
  })

  it('rejects a result belonging to another manifest', () => {
    const manifest = createTestBenchmarkManifest('manifest-a')
    const other = createTestBenchmarkManifest('manifest-b')
    const result = createTestBenchmarkResult(other)

    expect(() => createBenchmarkJsonExport(manifest, result)).toThrow(
      /do not match/,
    )
    expect(() => createBenchmarkCsvExport(manifest, result)).toThrow(
      /do not match/,
    )
  })
})
