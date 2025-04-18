import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import ui from './AngleEditor.module.css'
import type { EditorProps } from './types'

type AngleEditorProps = EditorProps<number> & {
  min?: number
  max?: number
  step?: number
}

export function AngleEditor(props: AngleEditorProps) {
  const min = () => props.min ?? 0
  const max = () => props.max ?? 2 * Math.PI
  const step = () => props.step ?? 0.01

  const [isDragging, setIsDragging] = createSignal(false)

  let trackRef: HTMLDivElement | undefined
  let indicatorRef: HTMLDivElement | undefined

  const valueToAngle = (value: number) => {
    return ((value - min()) / (max() - min())) * 360
  }

  const angleToValue = (angle: number) => {
    const normalizedAngle = ((angle % 360) + 360) % 360
    const value = min() + (normalizedAngle / 360) * (max() - min())
    return Math.round(value / step()) * step()
  }

  const updateRotation = () => {
    if (!indicatorRef) return

    const angle = valueToAngle(props.value)
    indicatorRef.style.transform = `rotate(${angle}deg)`
  }

  const handleMove = (clientX: number, clientY: number) => {
    if (!trackRef) return

    const rect = trackRef.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    // Calculate angle from center to mouse position
    const angle =
      Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI) + 90

    const newValue = angleToValue(angle)
    if (newValue !== props.value) {
      props.setValue(newValue)
    }
  }

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    handleMove(e.clientX, e.clientY)

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging()) {
        handleMove(e.clientX, e.clientY)
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleTouchStart = (e: TouchEvent) => {
    e.preventDefault()
    setIsDragging(true)

    if (e.touches[0]) {
      handleMove(e.touches[0].clientX, e.touches[0].clientY)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging() && e.touches[0]) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY)
      }
    }

    const handleTouchEnd = () => {
      setIsDragging(false)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }

    document.addEventListener('touchmove', handleTouchMove)
    document.addEventListener('touchend', handleTouchEnd)
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const direction = e.deltaY > 0 ? -1 : 1
    const newValue = props.value + direction * step()
    props.setValue(Math.max(min(), Math.min(max(), newValue)))
  }

  onMount(() => {
    updateRotation()
    if (trackRef) {
      trackRef.addEventListener('wheel', handleWheel, { passive: false })
    }
  })

  onCleanup(() => {
    if (trackRef) {
      trackRef.removeEventListener('wheel', handleWheel)
    }
  })

  createEffect(() => {
    updateRotation()
  })

  const formatAngle = () => {
    const degrees = ((props.value * 180) / Math.PI).toFixed(1)
    return `${degrees}°`
  }

  return (
    <label class={ui.label}>
      <span class={ui.name}>{props.name}</span>
      <div class={ui.container}>
        <div
          class={ui.track}
          ref={trackRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <div class={ui.centerDot} />
          <div class={ui.indicator} ref={indicatorRef}>
            <div class={ui.line} />
            <div class={ui.dot} />
          </div>
        </div>
        <span class={ui.value}>{formatAngle()}</span>
      </div>
    </label>
  )
}
