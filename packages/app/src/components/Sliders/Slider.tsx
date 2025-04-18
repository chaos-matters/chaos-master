import ui from './Slider.module.css'

type SliderProps = {
  value: number
  label?: string
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  formatValue?: (value: number) => string
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
    <>
      <label class={ui.label}>{label()}</label>
      <div class={ui.sliderContainer}>
        <div class={ui.sliderWrapper}>
          <div class={ui.track}>
            <div class={ui.fill} style={{ width: `${fillPercentage()}%` }} />
          </div>
          <input
            class={ui.slider}
            type="range"
            min={min()}
            max={max()}
            step={step()}
            value={props.value}
            onInput={(ev) => {
              props.onChange(ev.target.valueAsNumber)
            }}
          />
        </div>
        <span class={ui.value}>{formatValue()}</span>
      </div>
    </>
  )
}
