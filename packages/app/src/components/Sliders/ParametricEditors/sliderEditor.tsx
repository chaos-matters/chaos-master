import { For } from 'solid-js'
import { RangeEditor } from './RangeEditor'
import { editorProps } from './types'
import type { EditorFor } from './types'

export function sliderEditor(options: {
  min: number
  max: number
  step: number
}): EditorFor<number> {
  return (props) => (
    <RangeEditor
      {...props}
      min={options.min}
      max={options.max}
      step={options.step}
    />
  )
}

export function sliderLogEditor(options: {
  min: number
  max: number
  step: number
}): EditorFor<number> {
  return (props) => (
    <RangeEditor
      {...props}
      min={options.min}
      max={options.max}
      step={options.step}
      logarithmic
    />
  )
}

export function createObjectEditor<T extends Record<string, unknown>>(editors: {
  [K in keyof T]: EditorFor<T[K]>
}): EditorFor<T> {
  return (props) => (
    <>
      <For each={Object.keys(editors)}>
        {(key) => {
          const Editor = editors[key] as EditorFor<any>
          return <Editor {...editorProps(props, key as keyof T, key)} />
        }}
      </For>
    </>
  )
}
