import { createMemo, onMount, Show } from 'solid-js'
import { ScrubInput } from '@/components/Sliders/ScrubInput'
import { KeyframeDiamond } from '@/components/Timeline/KeyframeDiamond'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { useCompactMode } from '@/contexts/CompactModeContext'
import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import { useTimeline } from '@/contexts/TimelineContext'
import { createDragHandler } from '@/utils/createDragHandler'
import { keyframeEditedParams } from '@/utils/keyframeOnChange'
import { scrollIntoViewAndFocusOnChange } from '@/utils/scrollIntoViewOnChange'
import ui from './AngleEditor.module.css'
import { useParamMetaCapture } from './paramMetaCapture'
import type { EditorProps } from './types'

type AngleEditorProps = EditorProps<number> & {
  /** 'full' (default): name + track + value label in a display:contents row.
   *  'inline': self-contained compact knob with degree value inside the track. */
  mode?: 'full' | 'inline'
  /** Auto/track-changes recording target(s). When the knob drives several
   *  coefficients at once (symmetry rotation → preAffine a/b/d/e), pass them
   *  all so recording writes one grouped undo entry per gesture; defaults to
   *  [dataParameterPath]. */
  keyframePaths?: readonly string[]
}

function formatAngle(angleRadians: number) {
  const degrees = ((angleRadians * 180) / Math.PI).toFixed(1)
  return `${degrees}\u00b0`
}

function formatAngleShort(angleRadians: number) {
  const degrees = (angleRadians * 180) / Math.PI
  return `${Math.round(degrees)}\u00b0`
}

function formatDegrees(degrees: number) {
  return `${degrees.toFixed(1)}\u00b0`
}

export function AngleEditor(props: AngleEditorProps) {
  // Docs param-meta probe: report this param as an angle and render nothing.
  // Must run before the context hooks below so the probe needs no providers.
  const capture = useParamMetaCapture()
  if (capture) {
    onMount(() => {
      capture({
        paramKey: props.paramKey,
        name: props.name,
        valueType: 'angle',
        min: 0,
        max: 2 * Math.PI,
      })
    })
    return null
  }

  const history = useChangeHistory()
  const timeline = useTimeline()
  const { selectedKeyframePath } = useKeyframeTarget()
  const highlightedPath = () => selectedKeyframePath()
  const { isCompact } = useCompactMode()
  const value = createMemo(() => props.value)
  const mode = () => props.mode ?? 'full'

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
          // Compact sidebar path: keep the tour/keyframe target (e.g.
          // "angle-rotation") that the full/inline tracks also expose, so
          // creation tours can find the angle control here too.
          data-tour-target={
            props.dataParameterPath
              ? `angle-${props.dataParameterPath.split('.').pop()}`
              : undefined
          }
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
        // keyframePaths lets one knob record a whole coefficient group (e.g.
        // a symmetry rotation touching preAffine a/b/d/e) as ONE undo entry.
        keyframeEditedParams(
          timeline,
          props.keyframePaths ??
            (props.dataParameterPath ? [props.dataParameterPath] : []),
        )
      }
      setAngle(initEvent)
      return {
        onPointerMove: setAngle,
        onDone: () => {
          history.commit()
          // End of gesture: the next drag is its own undo step.
          timeline?.breakUndoCoalescing()
        },
      }
    })

    return (
      <Show
        when={mode() === 'full'}
        fallback={
          <div class={ui.inlineWrapper}>
            <Show when={props.dataParameterPath && timeline}>
              <KeyframeDiamond parameterPath={props.dataParameterPath!} />
            </Show>
            <div
              ref={(el) => {
                scrollIntoViewAndFocusOnChange(value, el)
              }}
              class={ui.trackInline}
              // Mirror the full-mode target so tours/keyframes can find this
              // angle in compact sidebar layout too (e.g. "angle-rotation").
              data-tour-target={
                props.dataParameterPath
                  ? `angle-${props.dataParameterPath.split('.').pop()}`
                  : undefined
              }
              data-parameter-path={props.dataParameterPath}
              onPointerDown={startRotating}
              tabIndex={0}
            >
              <div class={ui.indicator} style={{ '--angle': `${value()}rad` }}>
                <div class={ui.line} />
                <div class={ui.dot} />
              </div>
              <span class={ui.inlineValue}>{formatAngleShort(value())}</span>
            </div>
          </div>
        }
      >
        <label
          class={ui.label}
          data-parameter-path={props.dataParameterPath}
          classList={{
            [ui.targeted as string]:
              props.dataParameterPath !== undefined &&
              highlightedPath() === props.dataParameterPath,
          }}
        >
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
            data-tour-target={
              props.dataParameterPath
                ? `angle-${props.dataParameterPath.split('.').pop()}`
                : undefined
            }
            data-parameter-path={props.dataParameterPath}
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
      </Show>
    )
  }
}
