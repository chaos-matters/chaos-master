import { For } from 'solid-js'
import { useTimeline } from '@/contexts/TimelineContext'
import ui from './DopeSheet.module.css'
import type { KeyframeData } from '@/utils/timeline'

type DopeSheetTrackProps = {
  parameterPath: string
  label: string
  frameWidth: number
  trackHeight: number
  startFrame: number
  endFrame: number
  currentFrame: number
  selectedKeyframe: { path: string; frame: number } | null
  onSelectKeyframe: (path: string, frame: number) => void
  onDragKeyframe: (path: string, oldFrame: number, newFrame: number) => void
  onContextMenu: (e: MouseEvent, path: string, frame: number) => void
  onDeselectKeyframe: () => void
}

export function DopeSheetTrack(props: DopeSheetTrackProps) {
  const timeline = useTimeline()!

  const keyframes = () => {
    const track = timeline
      .tracks()
      .find((t) => t.parameterPath === props.parameterPath)
    if (!track) return []
    return [...track.keyframes].sort(
      (a: KeyframeData, b: KeyframeData) => a.frame - b.frame,
    )
  }

  const totalFrames = () => props.endFrame - props.startFrame
  const laneWidth = () => totalFrames() * props.frameWidth

  let dragStartFrame = 0
  let didDrag = false

  function handleDragStart(e: PointerEvent, frame: number) {
    if (e.button !== 0) return
    if (timeline.isPlaying()) return
    e.preventDefault()
    e.stopPropagation()

    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)

    dragStartFrame = frame
    didDrag = false

    function handleMove(ev: PointerEvent) {
      const lane = target.closest(`.${ui.lane}`)
      if (!lane) return
      const rect = lane.getBoundingClientRect()
      const x = ev.clientX - rect.left
      const newFrame = Math.round(x / props.frameWidth) + props.startFrame
      const clampedFrame = Math.max(
        props.startFrame,
        Math.min(props.endFrame, newFrame),
      )
      if (clampedFrame !== dragStartFrame) {
        didDrag = true
      }
    }

    function handleUp(ev: PointerEvent) {
      target.releasePointerCapture(e.pointerId)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)

      const lane = target.closest(`.${ui.lane}`)
      if (!lane) {
        didDrag = false
        return
      }
      const rect = lane.getBoundingClientRect()
      const x = ev.clientX - rect.left
      const newFrame = Math.round(x / props.frameWidth) + props.startFrame
      const clampedFrame = Math.max(
        props.startFrame,
        Math.min(props.endFrame, newFrame),
      )
      if (didDrag && clampedFrame !== dragStartFrame) {
        props.onDragKeyframe(props.parameterPath, dragStartFrame, clampedFrame)
      }
      didDrag = false
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  function handleLaneClick(e: MouseEvent) {
    const lane = (e.target as HTMLElement).closest(`.${ui.lane}`)
    if (!lane) return
    const rect = lane.getBoundingClientRect()
    const x = e.clientX - rect.left
    const frame = Math.round(x / props.frameWidth) + props.startFrame
    const clampedFrame = Math.max(
      props.startFrame,
      Math.min(props.endFrame, frame),
    )
    timeline.goToFrame(clampedFrame)
    props.onDeselectKeyframe()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isSelected = () =>
    props.selectedKeyframe?.path === props.parameterPath &&
    props.selectedKeyframe?.frame !== undefined

  return (
    <div class={ui.trackRow} style={{ height: `${props.trackHeight}px` }}>
      <div class={ui.trackName}>{props.label}</div>
      <div
        class={ui.lane}
        style={{ width: `${laneWidth()}px` }}
        onClick={handleLaneClick}
      >
        <For each={keyframes()}>
          {(kf) => {
            const left = () => (kf.frame - props.startFrame) * props.frameWidth
            return (
              <div
                class={ui.keyframeDot}
                classList={{
                  [ui.selectedDot as string]:
                    props.selectedKeyframe?.path === props.parameterPath &&
                    props.selectedKeyframe?.frame === kf.frame,
                  [ui.atCurrentFrame as string]:
                    kf.frame === props.currentFrame,
                }}
                style={{ left: `${left()}px` }}
                title={`Frame ${kf.frame}: ${String(kf.value)}`}
                onPointerDown={(e) => {
                  handleDragStart(e, kf.frame)
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!didDrag) {
                    props.onSelectKeyframe(props.parameterPath, kf.frame)
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (timeline.removeMode()) {
                    timeline.removeKeyframe(props.parameterPath, kf.frame)
                  } else {
                    props.onContextMenu(e, props.parameterPath, kf.frame)
                  }
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <path d="M5 0 L10 5 L5 10 L0 5 Z" />
                </svg>
              </div>
            )
          }}
        </For>
      </div>
    </div>
  )
}
