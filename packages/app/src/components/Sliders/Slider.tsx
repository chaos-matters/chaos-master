import { Show } from 'solid-js'
import ui from './Slider.module.css'

type SliderProps = {
  class?: string
  value: number
  label?: string
  min?: number
  max?: number
  step?: number
  onInput: (value: number) => void
  formatValue?: (value: number) => string
  trackFill?: boolean
}

export function Slider(props: SliderProps) {
  const label = () => props.label ?? ''
  const min = () => props.min ?? 0
  const max = () => props.max ?? 1
  const step = () => props.step ?? 0.01
  const formatValue = () =>
    props.formatValue ? props.formatValue(props.value) : props.value.toFixed(2)

  const fillPercentage = () => {
    const range = max() - min()
    return ((props.value - min()) / range) * 100
  }

  return (
    <label class={ui.label} classList={{ [props.class ?? '']: true }}>
      <Show when={label()}>
        <span>{label()}</span>
      </Show>
      <input
        class={ui.slider}
        type="range"
        min={min()}
        max={max()}
        step={step()}
        value={props.value}
        onInput={(ev) => {
          props.onInput(ev.target.valueAsNumber)
        }}
        style={{
          '--fill-percent': `${(props.trackFill ?? true) ? fillPercentage() : 0}%`,
        }}
      />
      <span class={ui.value}>{formatValue()}</span>
    </label>
  )
}
