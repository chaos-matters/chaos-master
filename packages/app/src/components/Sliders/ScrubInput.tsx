import { createSignal, Show } from 'solid-js'
import { KeyframeDiamond } from '@/components/Timeline/KeyframeDiamond'
import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import { useTimeline } from '@/contexts/TimelineContext'
import ui from './ScrubInput.module.css'

type ScrubInputProps = {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onInput: (value: number) => void
  formatValue?: (value: number) => string
  dataParameterPath?: string
  'data-tour-target'?: string
}

export function ScrubInput(props: ScrubInputProps) {
  const timeline = useTimeline()
  const { selectedKeyframePath } = useKeyframeTarget()
  const [editing, setEditing] = createSignal(false)
  const [editValue, setEditValue] = createSignal('')
  let inputRef: HTMLInputElement | undefined

  const step = () => props.step ?? 0.01
  const formatValue = () =>
    props.formatValue
      ? props.formatValue(props.value)
      : Number.isInteger(step())
        ? String(Math.round(props.value))
        : props.value.toFixed(3)

  function startScrub(e: PointerEvent) {
    if (editing()) return
    const startX = e.clientX
    const startValue = props.value
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX
      const sensitivity = ev.shiftKey ? 0.1 : 1
      let newValue = startValue + dx * step() * sensitivity
      if (props.min !== undefined) newValue = Math.max(props.min, newValue)
      if (props.max !== undefined) newValue = Math.min(props.max, newValue)
      props.onInput(newValue)

      if (
        timeline &&
        props.dataParameterPath &&
        timeline.autoKeyframe() &&
        timeline.hasAnyKeyframes(props.dataParameterPath)
      ) {
        timeline.addKeyframeAtCurrentFrame(props.dataParameterPath)
      }
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function startEdit() {
    setEditValue(formatValue())
    setEditing(true)
    requestAnimationFrame(() => inputRef?.select())
  }

  function commitEdit() {
    const parsed = parseFloat(editValue())
    if (!isNaN(parsed)) {
      let val = parsed
      if (props.min !== undefined) val = Math.max(props.min, val)
      if (props.max !== undefined) val = Math.min(props.max, val)
      props.onInput(val)
    }
    setEditing(false)
  }

  function cancelEdit() {
    setEditing(false)
  }

  return (
    <label
      class={ui.label}
      classList={{
        [ui.targeted as string]:
          props.dataParameterPath !== undefined &&
          selectedKeyframePath() === props.dataParameterPath,
      }}
      data-tour-target={props['data-tour-target']}
      onDblClick={startEdit}
      onPointerDown={startScrub}
    >
      <Show when={props.dataParameterPath && timeline}>
        <KeyframeDiamond parameterPath={props.dataParameterPath!} />
      </Show>
      <span class={ui.labelName}>{props.label}</span>
      <Show
        when={editing()}
        fallback={<span class={ui.value}>{formatValue()}</span>}
      >
        <input
          ref={inputRef}
          class={ui.input}
          type="text"
          value={editValue()}
          onInput={(e) => setEditValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') cancelEdit()
            e.stopPropagation()
          }}
          onBlur={commitEdit}
          onClick={(e) => {
            e.stopPropagation()
          }}
          onPointerDown={(e) => {
            e.stopPropagation()
          }}
        />
      </Show>
    </label>
  )
}
