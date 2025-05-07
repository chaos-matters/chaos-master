import { createMemo, Show } from 'solid-js'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { scrollIntoViewAndFocusOnChange } from '@/utils/scrollIntoViewOnChange'
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
  const history = useChangeHistory()
  const label = () => props.label ?? ''
  const min = () => props.min ?? 0
  const max = () => props.max ?? 1
  const step = () => props.step ?? 0.01
  const value = createMemo(() => props.value)
  const formatValue = () =>
    props.formatValue ? props.formatValue(value()) : value().toFixed(2)

  const fillPercentage = () => {
    const range = max() - min()
    return ((value() - min()) / range) * 100
  }

  return (
    <label class={ui.label} classList={{ [props.class ?? '']: true }}>
      <Show when={label()}>
        <span>{label()}</span>
      </Show>
      <input
        ref={(el) => {
          scrollIntoViewAndFocusOnChange(value, el)
        }}
        class={ui.slider}
        type="range"
        min={min()}
        max={max()}
        step={step()}
        value={value()}
        onInput={(ev) => {
          if (!history.isPreviewing()) {
            history.startPreview()
          }
          props.onInput(ev.target.valueAsNumber)
        }}
        onChange={(ev) => {
          props.onInput(ev.target.valueAsNumber)
          history.commit()
        }}
        style={{
          '--fill-percent': `${(props.trackFill ?? true) ? fillPercentage() : 0}%`,
        }}
      />
      <span class={ui.value}>{formatValue()}</span>
    </label>
  )
}
