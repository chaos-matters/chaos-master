import { onMount } from 'solid-js'
import { Slider } from '../Slider'
import { rangeValueType, useParamMetaCapture } from './paramMetaCapture'
import ui from './RangeEditor.module.css'
import type { EditorProps } from './types'

const { ceil, log10 } = Math

type RangeEditorProps = EditorProps<number> & {
  min?: number
  max?: number
  step?: number
  logarithmic?: boolean
}

export function RangeEditor(props: RangeEditorProps) {
  // Docs param-meta probe: report this param's range/type and render nothing.
  const capture = useParamMetaCapture()
  if (capture) {
    onMount(() => {
      capture({
        paramKey: props.paramKey,
        name: props.name,
        valueType: props.logarithmic
          ? 'float'
          : rangeValueType(props.min, props.step),
        min: props.min,
        max: props.max,
        step: props.step,
      })
    })
    return null
  }

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
      label={props.name}
      trackFill={false}
      formatValue={(value) => value.toFixed(decimals())}
      dataParameterPath={props.dataParameterPath}
    />
  )
}
