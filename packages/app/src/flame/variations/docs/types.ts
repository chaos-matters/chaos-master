import type { AnyVariationType } from '@/flame/variationRegistry'

/**
 * How a parameter's value should be read. `angle` values are stored in
 * radians (and rendered in degrees by the editors). This is authored metadata
 * — the editors bake ranges/types into JSX closures, so they are not
 * machine-readable and must be described here.
 */
export type ParamValueType = 'int' | 'float' | 'angle'

export type ParamDoc = {
  /** What this parameter controls. */
  description: string
  /** Inclusive [min, max] the editor allows. */
  range?: readonly [number, number]
  /** Value semantics, used to pick a badge/format. */
  valueType: ParamValueType
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
