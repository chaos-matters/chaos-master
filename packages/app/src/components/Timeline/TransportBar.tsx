import { createMemo } from 'solid-js'
import { useTimeline } from '@/contexts/TimelineContext'
import ui from './TimelineSection.module.css'

export function TransportBar() {
  const timeline = useTimeline()!
  const isPlaying = () => timeline.isPlaying()
  const config = createMemo(() => timeline.config())

  return (
    <div class={ui.transportControls}>
      <button
        class={ui.transportBtn}
        onClick={() => {
          timeline.goToFrame(config().startFrame)
        }}
        title="Go to start"
        data-testid="go-to-start"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
          <path d="M3 3h2v10H3V3zm3 5l8-5v10L6 8z" />
        </svg>
      </button>
      <button
        class={ui.transportBtn}
        onClick={() => {
          timeline.goBackFrame()
        }}
        title="Previous frame"
        data-testid="previous-frame"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
          <path d="M11 3L4 8l7 5V3z" />
        </svg>
      </button>
      <button
        class={ui.transportBtn}
        classList={{ [ui.active as string]: isPlaying() }}
        data-tour-target="play-button"
        onClick={() => {
          timeline.togglePlay()
        }}
        title="Play/Pause"
        data-testid={isPlaying() ? 'pause' : 'play'}
      >
        {isPlaying() ? (
          <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13">
            <path d="M4 2h3v12H4V2zm5 0h3v12H9V2z" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13">
            <path d="M4 2l10 6-10 6V2z" />
          </svg>
        )}
      </button>
      <button
        class={ui.transportBtn}
        onClick={() => {
          timeline.advanceFrame()
        }}
        title="Next frame"
        data-testid="next-frame"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
          <path d="M5 3l7 5-7 5V3z" />
        </svg>
      </button>
      <button
        class={ui.transportBtn}
        onClick={() => {
          timeline.goToFrame(config().endFrame)
        }}
        title="Go to end"
        data-testid="go-to-end"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
          <path d="M11 3h2v10h-2V3zM1 3l8 5-8 5V3z" />
        </svg>
      </button>
    </div>
  )
}
