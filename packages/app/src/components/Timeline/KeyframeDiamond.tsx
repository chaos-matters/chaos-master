import { Show } from 'solid-js'
import { useTimeline } from '@/contexts/TimelineContext'
import ui from './KeyframeDiamond.module.css'

type KeyframeDiamondProps = {
  parameterPath: string
  onContextMenu?: (e: MouseEvent) => void
}

export function KeyframeDiamond(props: KeyframeDiamondProps) {
  const timeline = useTimeline()!

  const hasKeyframes = () => timeline.hasAnyKeyframes(props.parameterPath)
  const hasAtFrame = () =>
    timeline.hasKeyframeAtFrame(props.parameterPath, timeline.currentFrame())

  return (
    <Show when={timeline.animationEnabled()}>
      <span
        class={ui.diamond}
        classList={{
          [ui.active as string]: hasAtFrame(),
          [ui.outlined as string]: hasKeyframes() && !hasAtFrame(),
          [ui.hidden as string]: !hasKeyframes(),
        }}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          if (timeline.removeMode()) {
            const frame = timeline.currentFrame()
            if (timeline.hasKeyframeAtFrame(props.parameterPath, frame)) {
              timeline.removeKeyframe(props.parameterPath, frame)
            }
          } else {
            timeline.toggleKeyframeAtCurrentFrame(props.parameterPath)
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          props.onContextMenu?.(e)
        }}
        title={
          timeline.removeMode()
            ? hasAtFrame()
              ? 'Remove Mode ON — click to remove this keyframe'
              : 'Remove Mode ON — no keyframe at this frame'
            : hasAtFrame()
              ? 'Keyframe at current frame (click to remove)'
              : hasKeyframes()
                ? 'Animated (click to add keyframe)'
                : ''
        }
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M5 0 L10 5 L5 10 L0 5 Z" />
        </svg>
      </span>
    </Show>
  )
}
