import { createMemo, Show } from 'solid-js'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { createDragHandler } from '@/utils/createDragHandler'
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
  trackFillValue?: number
  animateFill?: boolean
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
    const v = props.trackFillValue ?? value()
    return ((v - min()) / range) * 100
  }

  // Dragging the slider handle is handled by the browser,
  // but we still want to startPreview and commit to history once.
  const commitHandler = createDragHandler(
    () => {
      history.startPreview(`Edit ${props.label}`)
      return {
        onDone() {
          history.commit()
        },
      }
    },
    { preventDefault: false },
  )

  return (
    <label
      class={ui.label}
      classList={{
        [props.class ?? '']: true,
      }}
    >
      <Show when={label()}>
        <span>{label()}</span>
      </Show>
      <input
        ref={(el) => {
          scrollIntoViewAndFocusOnChange(value, el)
        }}
        class={ui.slider}
        classList={{
          [ui.animateFill]: props.animateFill,
        }}
        type="range"
        min={min()}
        max={max()}
        step={step()}
        value={value()}
        onPointerDown={commitHandler}
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
