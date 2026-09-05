import { For } from 'solid-js'
import { RangeEditor } from './RangeEditor'
import { editorProps } from './types'
import type { EditorProps } from './types'

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}

export function SchemaParamEditor(props: EditorProps<Record<string, number>>) {
  const keys = () => Object.keys(props.value ?? {})

  return (
    <For each={keys()}>
      {(key) => {
        const val = () => props.value?.[key] ?? 0
        const min = () => {
          const v = val()
          if (v < 0) return Math.floor(v * 2)
          return 0
        }
        const max = () => {
          const v = val()
          if (v > 1) return Math.ceil(v * 2)
          return 1
        }
        return (
          <RangeEditor
            {...editorProps(
              props,
              key,
              humanizeKey(key),
              props.dataParameterPath,
            )}
            min={min()}
            max={max()}
            step={0.01}
          />
        )
      }}
    </For>
  )
}
