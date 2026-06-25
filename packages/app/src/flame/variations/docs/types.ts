import type { AnyVariationType } from '@/flame/variationRegistry'

/**
 * How a parameter's value should be read. `angle` values are stored in radians
 * (rendered in degrees by the editors). The docs modal DERIVES value-type and
 * range automatically by probing each variation's editor (see
 * `ParametersOverview` / `paramMetaCapture`), so authored entries usually only
 * need a `description`. `valueType`/`range` here act as overrides for the rare
 * case where the derived value needs correcting.
 */
export type ParamValueType = 'int' | 'float' | 'angle' | 'bool'

export type ParamDoc = {
  /** What this parameter controls. */
  description: string
  /** Override the derived inclusive [min, max]. */
  range?: readonly [number, number]
  /** Override the derived value semantics. */
  valueType?: ParamValueType
  /** Optional unit suffix shown after the value (e.g. '×'). */
  unit?: string
}

export type VariationReference = {
  label: string
  url: string
}

export type VariationDoc = {
  /** One to three sentence summary of what the variation does. */
  summary: string
  /**
   * LaTeX body (no surrounding `$`) for the variation's transform, rendered
   * with MathJax. Optional — variations without it show "no math documented".
   */
  tex?: string
  /** Per-parameter docs, keyed by the variation's `paramStruct` field names. */
  params?: Record<string, ParamDoc>
  /** Optional external references / sources. */
  references?: readonly VariationReference[]
}

/**
 * Sparse map of documentation, keyed by variation type. Coverage is
 * intentionally partial and grows incrementally; the modal falls back to a
 * "not yet documented" state for missing entries. `docs.coverage.test.ts`
 * asserts that every present entry references a real variation + parameter.
 */
export type VariationDocMap = Partial<Record<AnyVariationType, VariationDoc>>
