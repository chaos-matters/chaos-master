import { parseFlameXmlDocumentWithReport } from './flameXml'
import type { FlameDescriptor } from './schema/flameSchema'

export type FlameXmlCompatibilityStatus =
  | 'importable'
  | 'importable-with-loss'
  | 'invalid'

export type FlameXmlCompatibilityInput = {
  path: string
  xml: string
  bytes: number
}

export type FlameXmlCompatibilityFlame = {
  index: number
  name: string
  status: FlameXmlCompatibilityStatus
  dimensions?: number
  transformCount?: number
  variationCount?: number
  variationTypes?: string[]
  diagnostics: string[]
}

export type FlameXmlCompatibilityFile = {
  path: string
  bytes: number
  status: FlameXmlCompatibilityStatus
  flameCount: number
  diagnostics: string[]
  flames: FlameXmlCompatibilityFlame[]
}

export type FlameXmlCompatibilityReport = {
  schemaVersion: 1
  summary: {
    files: number
    flames: number
    importable: number
    importableWithLoss: number
    invalidFlames: number
    invalidFiles: number
    /** Total invalid entries (invalid flames plus documents with no flames). */
    invalid: number
  }
  files: FlameXmlCompatibilityFile[]
}

/** Shared exit policy for CLI and future UI automation. */
export function flameXmlCompatibilityFailed(
  report: FlameXmlCompatibilityReport,
  strict = false,
): boolean {
  return (
    report.summary.invalid > 0 ||
    (strict && report.summary.importableWithLoss > 0)
  )
}

function flameMetrics(flame: FlameDescriptor) {
  const transforms = Object.values(flame.transforms)
  const variationTypes = new Set<string>()
  let variationCount = 0

  for (const transform of transforms) {
    for (const variation of Object.values(transform.variations)) {
      variationCount += 1
      variationTypes.add(variation.type)
    }
  }

  return {
    dimensions: flame.renderSettings.dimensions,
    transformCount: transforms.length,
    variationCount,
    variationTypes: [...variationTypes].sort(),
  }
}

function worstStatus(
  statuses: FlameXmlCompatibilityStatus[],
): FlameXmlCompatibilityStatus {
  if (statuses.includes('invalid')) return 'invalid'
  if (statuses.includes('importable-with-loss')) return 'importable-with-loss'
  return 'importable'
}

/**
 * Audit a set of XML documents with the production importer. Inputs are kept
 * filesystem-free so the same compatibility logic is testable and reusable by
 * a future in-app batch picker.
 */
export function analyzeFlameXmlBatch(
  inputs: FlameXmlCompatibilityInput[],
): FlameXmlCompatibilityReport {
  const files = [...inputs]
    // Code-point order is independent of the host locale, unlike localeCompare.
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map<FlameXmlCompatibilityFile>((input) => {
      try {
        const parsed = parseFlameXmlDocumentWithReport(input.xml)
        const flames = parsed.map<FlameXmlCompatibilityFlame>((entry) => {
          if (!entry.ok) {
            return {
              index: entry.index,
              name: entry.name,
              status: 'invalid',
              diagnostics: [entry.error],
            }
          }

          return {
            index: entry.index,
            name: entry.name,
            status:
              entry.warnings.length === 0
                ? 'importable'
                : 'importable-with-loss',
            ...flameMetrics(entry.flame),
            diagnostics: entry.warnings,
          }
        })

        return {
          path: input.path,
          bytes: input.bytes,
          status: worstStatus(flames.map((flame) => flame.status)),
          flameCount: flames.length,
          diagnostics: [],
          flames,
        }
      } catch (error) {
        return {
          path: input.path,
          bytes: input.bytes,
          status: 'invalid',
          flameCount: 0,
          diagnostics: [error instanceof Error ? error.message : String(error)],
          flames: [],
        }
      }
    })

  const flames = files.flatMap((file) => file.flames)
  const invalidFlames = flames.filter(
    (flame) => flame.status === 'invalid',
  ).length
  const invalidFiles = files.filter((file) => file.flameCount === 0).length
  return {
    schemaVersion: 1,
    summary: {
      files: files.length,
      flames: flames.length,
      importable: flames.filter((flame) => flame.status === 'importable')
        .length,
      importableWithLoss: flames.filter(
        (flame) => flame.status === 'importable-with-loss',
      ).length,
      invalidFlames,
      invalidFiles,
      invalid: invalidFlames + invalidFiles,
    },
    files,
  }
}
