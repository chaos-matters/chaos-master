// One tick of wall-clock playback: `timeScale` frames of the timeline, as the render loop drives it.
import type { TimelineState } from './timeline'

/**
 * Advance a playing timeline by up to `frames`, the loop's `timeScale`.
 *
 * Flam3's interval calls this once per `1000 / fps` ms, so at speeds above 1
 * one tick moves the playhead several frames. The playback can stop partway
 * through a tick: an arena clash pauses on its last frame, and a timeline
 * with loop off stops at its end. The rest of the tick must then do nothing.
 * Advancing a paused timeline is an authored seek, which the recorder logs
 * and which moves the playhead off the frame the playback stopped on.
 */
export function advancePlaybackTick(
  timeline: Pick<TimelineState, 'advanceFrame' | 'isPlaying'>,
  frames: number,
): void {
  for (let i = 0; i < frames && timeline.isPlaying(); i++) {
    timeline.advanceFrame()
  }
}
