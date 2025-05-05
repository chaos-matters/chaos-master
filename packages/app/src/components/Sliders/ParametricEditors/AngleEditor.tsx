import { createDragHandler } from '@/utils/createDragHandler'
import ui from './AngleEditor.module.css'
import type { EditorProps } from './types'

type AngleEditorProps = EditorProps<number>

function formatAngle(angle: number) {
  const degrees = ((angle * 180) / Math.PI).toFixed(1)
  return `${degrees}°`
}

export function AngleEditor(props: AngleEditorProps) {
  const startRotating = createDragHandler((initEvent) => {
    const el = initEvent.currentTarget
    if (!(el instanceof HTMLElement)) {
      throw new Error('unreachable code')
    }
    const rect = el.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const setAngle = (ev: PointerEvent) => {
      let newAngle = -1 * Math.atan2(ev.clientY - centerY, ev.clientX - centerX)
      if (newAngle < 0) {
        newAngle += 2 * Math.PI
      }
      props.setValue(newAngle)
    }
    setAngle(initEvent)
    return {
      onPointerMove: setAngle,
    }
  })
  return (
    <label class={ui.label}>
      <span class={ui.name}>{props.name}</span>
      <div class={ui.container}>
        <div class={ui.track} onPointerDown={startRotating}>
          <div class={ui.indicator} style={{ '--angle': `${props.value}rad` }}>
            <div class={ui.line} />
            <div class={ui.dot} />
          </div>
        </div>
        <span class={ui.value}>{formatAngle(props.value)}</span>
      </div>
    </label>
  )
}
