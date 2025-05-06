import { Slider } from '../Slider'
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
    <Slider
      class={ui.alignLabelRight}
      value={props.value}
      onInput={props.setValue}
      min={props.min}
      max={props.max}
      step={props.step}
      trackFill={false}
      label={props.name}
      formatValue={(value) => value.toFixed(decimals())}
    />
  )
}
