import { createContext, useContext } from 'solid-js'
import type { JSX } from 'solid-js'

/**
 * Lightweight capture mechanism so the documentation modal can read each
 * parameter's value-type and numeric range straight from the real editors —
 * without each variation having to declare metadata.
 *
 * The shared editor primitives (RangeEditor, AngleEditor) report into this
 * context when a collector is present. In normal editing no collector is in
 * context, so the primitives render as usual with zero overhead. Only the docs
 * "Parameters" probe provides a collector, and in that mode the primitives
 * report their range/type and render nothing (no DOM, no side-effects).
 */
export type ParamValueType = 'int' | 'float' | 'angle' | 'bool'

export type CapturedParamMeta = {
  /** Struct field key (from `editorProps`), used to map back to the parameter. */
  paramKey?: string
  name?: string
  valueType: ParamValueType
  min?: number
  max?: number
  step?: number
}

export type ParamMetaReporter = (meta: CapturedParamMeta) => void

const ParamMetaCaptureContext = createContext<ParamMetaReporter>()

export function useParamMetaCapture(): ParamMetaReporter | undefined {
  return useContext(ParamMetaCaptureContext)
}

export function ParamMetaCaptureProvider(props: {
  report: ParamMetaReporter
  children: JSX.Element
}): JSX.Element {
  return (
    <ParamMetaCaptureContext.Provider value={props.report}>
      {props.children}
    </ParamMetaCaptureContext.Provider>
  )
}

/** Integer step over an integer floor reads as a natural-number / int param. */
export function rangeValueType(
  min: number | undefined,
  step: number | undefined,
): ParamValueType {
  const isInt =
    step !== undefined &&
    Number.isInteger(step) &&
    step >= 1 &&
    (min === undefined || Number.isInteger(min))
  return isInt ? 'int' : 'float'
}
