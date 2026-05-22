import type { Component } from 'solid-js'

export type EditorProps<T> = {
  name?: string
  value: T
  setValue: (val: T) => void
  dataParameterPath?: string
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
    dataParameterPath: pathPrefix ? `${pathPrefix}.${String(key)}` : undefined,
    get value() {
      return props.value[key]
    },
    setValue(value) {
      props.setValue({ ...props.value, [key]: value })
    },
  }
}
