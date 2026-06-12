import { createEffect, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'
import { useTimeline } from '@/contexts/TimelineContext'
import ui from './KeyframeContextMenu.module.css'

type TrackContextMenuProps = {
  x: number
  y: number
  parameterPath: string
  isOrphaned: boolean
  onClose: () => void
  onClearAllInvalid: () => void
}

export function TrackContextMenu(props: TrackContextMenuProps) {
  const timeline = useTimeline()!

  function close() {
    props.onClose()
  }

  createEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }

    function handleClick() {
      close()
    }
    setTimeout(() => {
      window.addEventListener('keydown', handleKey)
      window.addEventListener('click', handleClick)
    }, 0)
    onCleanup(() => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('click', handleClick)
    })
  })

  const hasAny = () => timeline.hasAnyKeyframes(props.parameterPath)

  return (
    <Portal>
      <div
        class={ui.menu}
        style={{
          left: `${props.x}px`,
          top: `${props.y}px`,
        }}
        onClick={(e) => {
          e.stopPropagation()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
        }}
      >
        <button
          class={ui.item}
          disabled={!hasAny()}
          onClick={() => {
            timeline.removeAllKeyframesForPath(props.parameterPath)
            close()
          }}
        >
          Clear all keyframes on this track
        </button>
        <button
          class={ui.item}
          onClick={() => {
            props.onClearAllInvalid()
            close()
          }}
        >
          Clear all invalid (orphaned) tracks
        </button>
      </div>
    </Portal>
  )
}
