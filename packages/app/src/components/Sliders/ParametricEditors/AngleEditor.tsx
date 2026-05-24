import { createMemo, Show } from 'solid-js'
import { ScrubInput } from '@/components/Sliders/ScrubInput'
import { KeyframeDiamond } from '@/components/Timeline/KeyframeDiamond'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { useCompactMode } from '@/contexts/CompactModeContext'
import { useTimeline } from '@/contexts/TimelineContext'
import { createDragHandler } from '@/utils/createDragHandler'
import { scrollIntoViewAndFocusOnChange } from '@/utils/scrollIntoViewOnChange'
import ui from './AngleEditor.module.css'
import type { EditorProps } from './types'

type AngleEditorProps = EditorProps<number>

function formatAngle(angleRadians: number) {
  const degrees = ((angleRadians * 180) / Math.PI).toFixed(1)
  return `${degrees}°`
}

function formatDegrees(degrees: number) {
  return `${degrees.toFixed(1)}°`
}

export function AngleEditor(props: AngleEditorProps) {
  const history = useChangeHistory()
  const timeline = useTimeline()
  const { isCompact } = useCompactMode()
  const value = createMemo(() => props.value)

  return (
    <Show
      when={!isCompact()}
      fallback={
        <ScrubInput
          label={props.name ?? 'angle'}
          value={(props.value * 180) / Math.PI}
          min={0}
          max={360}
          step={1}
          onInput={(degrees) => {
            let clamped = degrees
            if (clamped < 0) clamped += 360
            if (clamped >= 360) clamped -= 360
            props.setValue((clamped * Math.PI) / 180)
          }}
          formatValue={formatDegrees}
          dataParameterPath={props.dataParameterPath}
        />
      }
    >
      <AngleTrack />
    </Show>
  )

  function AngleTrack() {
    const startRotating = createDragHandler((initEvent) => {
      history.startPreview(`Edit ${props.name ?? 'angle'}`)
      const el = initEvent.currentTarget
      if (!(el instanceof HTMLElement)) {
        throw new Error('unreachable code')
      }
      el.focus()
      const rect = el.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const setAngle = (ev: PointerEvent) => {
        let newAngle =
          -1 * Math.atan2(ev.clientY - centerY, ev.clientX - centerX)
        if (newAngle < 0) {
          newAngle += 2 * Math.PI
        }
        props.setValue(newAngle)
        // Auto-keyframe: only for already-animated params when auto mode is on
        if (
          timeline &&
          props.dataParameterPath &&
          timeline.autoKeyframe() &&
          timeline.hasAnyKeyframes(props.dataParameterPath)
        ) {
          timeline.addKeyframeAtCurrentFrame(props.dataParameterPath)
        }
      }
      setAngle(initEvent)
      return {
        onPointerMove: setAngle,
        onDone: history.commit,
      }
    })

    return (
      <label class={ui.label}>
        <span class={ui.name}>
          <Show when={props.dataParameterPath && timeline}>
            <KeyframeDiamond parameterPath={props.dataParameterPath!} />
          </Show>
          {props.name}
        </span>
        <div
          ref={(el) => {
            scrollIntoViewAndFocusOnChange(value, el)
          }}
          class={ui.track}
          onPointerDown={startRotating}
          tabIndex={0}
        >
          <div class={ui.indicator} style={{ '--angle': `${value()}rad` }}>
            <div class={ui.line} />
            <div class={ui.dot} />
          </div>
        </div>
        <span class={ui.value}>{formatAngle(value())}</span>
      </label>
    )
  }
}
