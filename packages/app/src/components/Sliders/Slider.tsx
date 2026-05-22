import { createMemo, Show } from 'solid-js'
import { clamp } from 'typegpu/std'
import { ScrubInput } from '@/components/Sliders/ScrubInput'
import { KeyframeDiamond } from '@/components/Timeline/KeyframeDiamond'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { useCompactMode } from '@/contexts/CompactModeContext'
import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import { useTimeline } from '@/contexts/TimelineContext'
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
  trackFill?: boolean
  onInput: (value: number) => void
  formatValue?: (value: number) => string
  /** Parameter path for Blender-style keyframe targeting */
  dataParameterPath?: string
  'data-tour-target'?: string
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
    return clamp(props.value, min(), max())
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
        />
      }
    >
      <FullSlider />
    </Show>
  )

  function FullSlider() {
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
        data-tour-target={props['data-tour-target']}
        classList={{
          [props.class ?? '']: true,
          [ui.targeted as string]:
            props.dataParameterPath !== undefined &&
            highlightedPath() === props.dataParameterPath,
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
            data-parameter-path={props.dataParameterPath}
            onPointerDown={commitHandler}
            onInput={(ev) => {
              props.onInput(ev.target.valueAsNumber)
              // Auto-keyframe: only for already-animated params when auto mode is on
              if (
                timeline &&
                props.dataParameterPath &&
                timeline.autoKeyframe() &&
                timeline.hasAnyKeyframes(props.dataParameterPath)
              ) {
                timeline.addKeyframeAtCurrentFrame(props.dataParameterPath)
              }
            }}
            onDblClick={() => {
              if (props.dataParameterPath !== undefined) {
                setTargetedParameter(props.dataParameterPath)
              }
            }}
          />
        </div>
        <span class={ui.value}>{formatValue()}</span>
      </label>
    )
  }
}
