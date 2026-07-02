import { createMemo, Show } from 'solid-js'
import { clamp } from 'typegpu/std'
import { ScrubInput } from '@/components/Sliders/ScrubInput'
import { KeyframeDiamond } from '@/components/Timeline/KeyframeDiamond'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { useCompactMode } from '@/contexts/CompactModeContext'
import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import { useTimeline } from '@/contexts/TimelineContext'
import { keyframeEditedParam } from '@/utils/keyframeOnChange'
import { scrollIntoViewAndFocusOnChange } from '@/utils/scrollIntoViewOnChange'
import ui from './Slider.module.css'

type SliderProps = {
  class?: string
  value: number
  label?: string
  min?: number
  max?: number
  step?: number
  trackFill?: boolean
  showValue?: boolean
  variant?: 'default' | 'compact'
  onInput: (value: number) => void
  formatValue?: (value: number) => string
  /** Parameter path for Blender-style keyframe targeting */
  dataParameterPath?: string
  'data-tour-target'?: string
  /** Dims the control and blocks input — used when a setting has no effect. */
  disabled?: boolean
  /** Tooltip explaining why the control is disabled. */
  disabledReason?: string
}

export function Slider(props: SliderProps) {
  const history = useChangeHistory()
  const { selectedKeyframePath, setTargetedParameter } = useKeyframeTarget()
  const timeline = useTimeline()
  const { isCompact } = useCompactMode()

  const highlightedPath = () => selectedKeyframePath()

  const label = () => props.label ?? ''
  const min = () => props.min ?? 0
  const max = () => props.max ?? 1
  const step = () => props.step ?? 0.01
  const value = createMemo(() => {
    // Guard against undefined/NaN (e.g. a stale flame whose variation params
    // don't match the current schema): typegpu's clamp throws on a non-number
    // argument, which would otherwise crash the whole editor.
    const v = props.value
    return clamp(Number.isFinite(v) ? v : min(), min(), max())
  })
  const formatValue = () =>
    props.formatValue ? props.formatValue(value()) : value().toFixed(2)

  const fillPercentage = () => {
    const range = max() - min()
    return ((value() - min()) / range) * 100
  }

  return (
    <Show
      when={!isCompact()}
      fallback={
        <ScrubInput
          label={label()}
          value={value()}
          min={min()}
          max={max()}
          step={step()}
          onInput={props.onInput}
          formatValue={props.formatValue}
          dataParameterPath={props.dataParameterPath}
          data-tour-target={props['data-tour-target']}
          disabled={props.disabled}
          disabledReason={props.disabledReason}
        />
      }
    >
      <FullSlider />
    </Show>
  )

  function FullSlider() {
    return (
      <label
        class={ui.label}
        classList={{
          [props.class ?? '']: true,
          [ui.compact as string]: props.variant === 'compact',
          [ui.disabled as string]: props.disabled === true,
          [ui.targeted as string]:
            props.dataParameterPath !== undefined &&
            highlightedPath() === props.dataParameterPath,
        }}
        title={props.disabled ? props.disabledReason : undefined}
        onContextMenu={(e) => {
          e.preventDefault()
        }}
      >
        <span class={ui.labelRow}>
          <Show when={props.dataParameterPath && timeline}>
            <KeyframeDiamond parameterPath={props.dataParameterPath!} />
          </Show>
          <Show when={label()}>
            <span>{label()}</span>
          </Show>
        </span>
        <div
          class={ui.sliderWrapper}
          data-tour-target={props['data-tour-target']}
          style={{
            '--fill-percent': `${(props.trackFill ?? true) ? fillPercentage() : 0}%`,
          }}
        >
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
            aria-valuetext={formatValue()}
            disabled={props.disabled}
            data-parameter-path={props.dataParameterPath}
            onPointerDown={() => {
              history.startPreview(`Edit ${props.label ?? 'slider'}`)
            }}
            onPointerUp={() => {
              history.commit()
              // End of gesture: the next drag is its own undo step.
              timeline?.breakUndoCoalescing()
            }}
            onPointerCancel={() => {
              history.commit()
              timeline?.breakUndoCoalescing()
            }}
            onInput={(ev) => {
              props.onInput(ev.target.valueAsNumber)
              keyframeEditedParam(timeline, props.dataParameterPath)
            }}
            onDblClick={() => {
              if (props.dataParameterPath !== undefined) {
                setTargetedParameter(props.dataParameterPath)
              }
            }}
          />
        </div>
        <Show when={props.showValue !== false}>
          <span class={ui.value}>{formatValue()}</span>
        </Show>
      </label>
    )
  }
}
