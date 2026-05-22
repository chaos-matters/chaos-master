import { createMemo } from 'solid-js'
import { useTimeline } from '@/contexts/TimelineContext'
import { getAllTrackFrames } from '@/utils/timeline'
import ui from './TimelineRuler.module.css'

export function TimelineRuler() {
  const timeline = useTimeline()!

  const config = createMemo(() => timeline.config())
  const tracks = createMemo(() => timeline.tracks())

  const keyframeFramesArr = createMemo(() => getAllTrackFrames(tracks()))

  const frameWidth = 30 // pixels per frame
  const totalWidth = createMemo(() => config().endFrame * frameWidth)

  // Only render frame labels at intervals to reduce DOM nodes
  // Ensure ~60px between labels minimum
  const frameLabelInterval = Math.max(1, Math.ceil(60 / frameWidth))

  const frameLabels = createMemo(() => {
    const labels: number[] = []
    const end = config().endFrame
    for (let i = 0; i <= end; i += frameLabelInterval) {
      labels.push(i)
    }
    // Always include the last frame
    if (labels[labels.length - 1] !== end) {
      labels.push(end)
    }
    return labels
  })

  return (
    <div
      class={ui.ruler}
      style={{ width: `${totalWidth()}px` }}
      data-testid="timeline-ruler"
    >
      <div class={ui.markers}>
        {keyframeFramesArr().map((frame) => (
          <div
            data-key={frame}
            class={ui.keyframeMarker}
            style={{ left: `${frame * frameWidth}px` }}
            data-testid={`frame-marker-${frame}`}
          />
        ))}
      </div>
      <div class={ui.scale}>
        {frameLabels().map((frame) => (
          <span
            data-keyframe={frame}
            style={{
              width: `${Math.min(frameLabelInterval, config().endFrame - frame + 1) * frameWidth}px`,
              'text-align': 'center',
            }}
            data-testid={`frame-number-${frame}`}
          >
            {frame}
          </span>
        ))}
      </div>
    </div>
  )
}
