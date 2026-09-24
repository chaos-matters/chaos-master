// Plays a staged clash once and holds its last frame, then gives the viewer's loop setting back.
import { createEffect, createRoot, on } from 'solid-js'
import { withRecordingSuppressed } from '@/recorder/recorder'
import type { TimelineState } from '@/contexts/TimelineContext'

type ClashTimeline = Pick<
  TimelineState,
  | 'config'
  | 'setConfig'
  | 'isPlaying'
  | 'currentFrame'
  | 'setCurrentFrame'
  | 'play'
  | 'pause'
>

export type ClashPlayback = {
  /** Stop now and hold the last frame: Skip to Results, or the clock. */
  finish: () => void
  /** Give the viewer's `loop` and `loopMode` back and stop watching. */
  release: () => void
}

/**
 * Start a staged clash's playback, once.
 *
 * The clash keyframes its rounds into the viewer's own timeline, whose default
 * config loops. Left alone, round 1 replays after round 3 while the HUD still
 * says ROUND 3 / 3, and the picture can show the loser winning again after the
 * verdict. So the loop is off for the clash, and the playback pauses on the
 * last frame, where the final round resolves, instead of running off the end
 * to frame 0 where a stopped timeline goes.
 *
 * In the app the timeline is the recorder-aware one, and a take may be
 * running. The only step this adds to it is the pause, which the recorder
 * pins to the frame it pauses on, so a replay holds the same last frame. The
 * seeks are raw: the one to the start repeats the seek `animate_clash` has
 * already recorded, and the one to the end is carried by the pause after it.
 * The loop change is raw too, like every config write outside the editor.
 *
 * Call `release` before staging another clash and whenever the workspace is
 * given back; it is safe to call twice.
 */
export function playClashOnce(timeline: ClashTimeline): ClashPlayback {
  const before = timeline.config()
  const { loop, loopMode } = before
  timeline.setConfig({ ...before, loop: false, loopMode: 'off' })

  // Set while this helper seeks, so the watcher below does not pause inside
  // the suppressed seek, where the recorder would not see the pause.
  let seeking = false
  const seek = (frame: number) => {
    seeking = true
    try {
      withRecordingSuppressed(() => timeline.setCurrentFrame(frame))
    } finally {
      seeking = false
    }
  }

  let dispose = () => {}
  let released = false
  const release = () => {
    if (released) return
    released = true
    dispose()
    timeline.setConfig({ ...timeline.config(), loop, loopMode })
  }

  try {
    dispose = createRoot((disposeRoot) => {
      // Not deferred: a timeline that was already playing when the clash
      // started never changes `isPlaying`, and the playhead is what counts.
      createEffect(
        on(timeline.currentFrame, (frame) => {
          if (
            !seeking &&
            timeline.isPlaying() &&
            frame >= timeline.config().endFrame
          ) {
            timeline.pause()
          }
        }),
      )
      return disposeRoot
    })
    seek(timeline.config().startFrame)
    timeline.play()
  } catch (error) {
    release()
    throw error
  }

  return {
    finish: () => {
      if (released) return
      if (!timeline.isPlaying()) return
      // End first, then pause: the pause is the step that records the frame.
      seek(timeline.config().endFrame)
      timeline.pause()
    },
    release,
  }
}
