// playClashOnce gives the viewer's loop setting back even when starting the playback throws.
import { describe, expect, it } from 'vitest'
import { createTimelineState } from '@/utils/timeline'
import { playClashOnce } from './clashPlayback'

describe('playClashOnce', () => {
  it("gives the viewer's loop setting back when the playback fails to start", () => {
    const timeline = createTimelineState()
    timeline.setConfig({ ...timeline.config(), loop: true, loopMode: 'cycle' })
    const failing = {
      ...timeline,
      play: () => {
        throw new Error('no playback')
      },
    }

    expect(() => playClashOnce(failing)).toThrow('no playback')
    expect(timeline.config().loop).toBe(true)
    expect(timeline.config().loopMode).toBe('cycle')
  })
})
