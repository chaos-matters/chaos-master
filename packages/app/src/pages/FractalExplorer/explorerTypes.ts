/**
 * What the explorer's frame loop tells the GPU module: the grid, how a
 * picture is iterated and coloured, and how the last picture maps into the
 * next one.
 */

export interface GridSize {
  readonly width: number
  readonly height: number
}

export interface IterationSetup {
  readonly size: GridSize
  /** View centre minus reference, in pixels, y up. */
  readonly centerOffset: { readonly x: number; readonly y: number }
  readonly spacing: { readonly mantissa: number; readonly exponent: number }
  readonly maxIterations: number
  readonly hasDc: boolean
  readonly useBla: boolean
}

/** How the previous display maps into the new view, in its own pixels. */
export interface BackdropMapping {
  readonly scale: number
  readonly offset: { readonly x: number; readonly y: number }
}

export interface ColourSetup {
  readonly period: number
  readonly phase: number
  readonly relief: number
  readonly interior: readonly [number, number, number]
  readonly background: readonly [number, number, number]
}

export interface StepResult {
  /** Pixels still iterating after this step, or undefined if not read back. */
  readonly active: number | undefined
  /** Wall time from submit to GPU completion, ms. */
  readonly gpuMs: number
}
