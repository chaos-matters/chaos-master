// A plain flame loaded while the timeline plays stops playback through the
// timeline's `pause()`, outside the block that keeps the load's own writes out
// of the take, so the take records the Pause and its replay stops where the
// viewer saw it stop (code audit 2026-09-23, F2). The raw `setIsPlaying` it
// replaces reports nothing, and inside that block nothing would be recorded
// anyway.
//
// MainWorkspace cannot be mounted (see MainWorkspace.capture.test.ts), so the
// order is read out of the source. What that order records and how a replay
// plays it is proved end to end in recorder/playWindowReplay.test.ts.
import { describe, expect, it } from 'vitest'
import source from './MainWorkspace.tsx?raw'

const code = source.replace(/\s+/g, ' ')

describe('the plain-flame load', () => {
  it('stops playback through pause(), before the unrecorded block', () => {
    expect(code).toContain(
      'if (anim.tracks.length === 0) timeline.pause() withRecordingSuppressed(() => {',
    )
  })

  it('never stops it through the raw setter, which reports nothing', () => {
    expect(code).not.toMatch(/\.setIsPlaying\(/)
  })
})
