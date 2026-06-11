import { createEffect, createSignal, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'
import { useTimeline } from '@/contexts/TimelineContext'
import ui from './KeyframeContextMenu.module.css'
import type { EasingCurve } from '@/utils/timeline'

type KeyframeContextMenuProps = {
  x: number
  y: number
  parameterPath: string
  frame: number
  onClose: () => void
}

const EASING_OPTIONS: EasingCurve[] = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'bounce',
  'elastic',
]

export function KeyframeContextMenu(props: KeyframeContextMenuProps) {
  const timeline = useTimeline()!
  const [showEasing, setShowEasing] = createSignal(false)

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

  const hasAtFrame = () =>
    timeline.hasKeyframeAtFrame(props.parameterPath, props.frame)
  const hasAny = () => timeline.hasAnyKeyframes(props.parameterPath)

  const currentEasing = () => {
    const kf = timeline.getKeyframeAtFrame(props.parameterPath, props.frame)
    return kf?.easing ?? 'linear'
  }

  function setEasing(easing: EasingCurve) {
    const kf = timeline.getKeyframeAtFrame(props.parameterPath, props.frame)
    if (kf && kf.value !== null && typeof kf.value !== 'boolean') {
      timeline.addKeyframe(props.parameterPath, props.frame, kf.value, easing)
    }
    close()
  }

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
          onClick={() => {
            const val = timeline.getResolvedValue(props.parameterPath)
            if (val !== null) {
              timeline.addKeyframe(props.parameterPath, props.frame, val)
            }
            close()
          }}
        >
          Insert Keyframe
        </button>
        <button
          class={ui.item}
          disabled={!hasAtFrame()}
          onClick={() => {
            timeline.removeKeyframe(props.parameterPath, props.frame)
            close()
          }}
        >
          Remove Keyframe
        </button>
        <button
          class={ui.item}
          disabled={!hasAny()}
          onClick={() => {
            timeline.removeAllKeyframesForPath(props.parameterPath)
            close()
          }}
        >
          Remove All Keyframes
        </button>
        <hr class={ui.separator} />
        <button
          class={ui.item}
          disabled={!hasAtFrame()}
          onClick={() => setShowEasing(!showEasing())}
        >
          Easing: {currentEasing()}
        </button>
        {showEasing() && (
          <div class={ui.easingSubmenu}>
            {EASING_OPTIONS.map((opt) => (
              <button
                class={ui.item}
                classList={{
                  [ui.activeEasing as string]: currentEasing() === opt,
                }}
                onClick={() => {
                  setEasing(opt)
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    </Portal>
  )
}
