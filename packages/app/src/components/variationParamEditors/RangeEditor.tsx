import ui from './RangeEditor.module.css'
import type { EditorProps } from './types'

const { ceil, log10 } = Math

type RangeEditorProps = EditorProps<number> & {
  min?: number
  max?: number
  step?: number
}

export function RangeEditor(props: RangeEditorProps) {
  const step = () => props.step ?? 0.01
  const decimals = () =>
    Number.isInteger(step()) ? 0 : ceil(log10(1 / (step() % 1)))
  return (
    <label class={ui.label}>
      <span class={ui.name}>{props.name}</span>
      <span>
        <input
          type="range"
          min={props.min ?? 0}
          max={props.max ?? 1}
          step={step()}
          value={props.value}
          onInput={(ev) => {
            props.setValue(ev.target.valueAsNumber)
          }}
        />
        {props.value.toFixed(decimals())}
      </span>
    </label>
  )
}
