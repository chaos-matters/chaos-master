import type { Component } from 'solid-js'

export type EditorProps<T> = {
  name?: string
  value: T
  setValue: (val: T) => void
  /**
   * Optional root-object fast path for edits that change one numeric field.
   *
   * Variation params use this to preserve the field key in the command log;
   * callers without a scalar command keep the existing whole-object update.
   */
  setParamValue?: (key: string, value: number) => void
  dataParameterPath?: string
  /** Struct field key — lets the docs param-meta capture map ranges to params. */
  paramKey?: string
}

export type EditorFor<T> = Component<EditorProps<T>>

export function editorProps<
  T extends Record<string, unknown>,
  K extends keyof T,
>(
  props: EditorProps<T>,
  key: K,
  name: string,
  dataParameterPath?: string,
): EditorProps<T[K]> & { dataParameterPath?: string } {
  const pathPrefix = dataParameterPath ?? props.dataParameterPath
  return {
    name,
    paramKey: String(key),
    dataParameterPath: pathPrefix ? `${pathPrefix}.${String(key)}` : undefined,
    get value() {
      return props.value[key]
    },
    setValue(value) {
      if (typeof value === 'number' && props.setParamValue) {
        props.setParamValue(String(key), value)
        return
      }
      props.setValue({ ...props.value, [key]: value })
    },
  }
}
