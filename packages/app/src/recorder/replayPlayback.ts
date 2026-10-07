/**
 * A live timeline as a replay paces it: the `playback` a replay target hands
 * the player. While a window plays, `pacedPlayback` keeps the render loop's
 * clock off the playhead (flame/Flam3.tsx) and the replay moves it itself.
 * Every write is suppressed: the replay's transport is not a step.
 */

import { batch } from 'solid-js'
import { withRecordingSuppressed } from './recorder'
import type { ReplayPlayback } from './replay'
import type { TimelineState } from '@/utils/timeline'

export function timelineReplayPlayback(
  timeline: TimelineState,
): ReplayPlayback {
  return {
    read: () => ({ ...timeline.config(), frame: timeline.currentFrame() }),
    hold: (frame, playing) => {
      withRecordingSuppressed(() => {
        batch(() => {
          timeline.setPacedPlayback(playing)
          // Play first: a non-looping Play on the last frame starts over, and
          // the playhead belongs where the replay says, not at the start.
          if (playing && !timeline.isPlaying()) timeline.play()
          if (!playing && timeline.isPlaying()) timeline.pause()
          if (timeline.currentFrame() !== frame) timeline.setCurrentFrame(frame)
          timeline.setPreviewHeld(true)
        })
      })
    },
    release: () => {
      timeline.setPacedPlayback(false)
    },
  }
}
