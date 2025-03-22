import { Component } from 'solid-js'

export type EditorProps<T> = {
  name?: string
  value: T
  setValue: (val: T) => void
}

export type EditorFor<T> = Component<EditorProps<T>>

export function editorProps<
  T extends Record<string, unknown>,
  K extends keyof T,
>(props: EditorProps<T>, key: K, name: string): EditorProps<T[K]> {
  return {
    name,
    get value() {
      return props.value[key]
    },
    setValue(value) {
      props.setValue({ ...props.value, [key]: value })
    },
  }
}
