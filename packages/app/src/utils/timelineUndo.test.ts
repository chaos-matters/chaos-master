import { beforeEach, describe, expect, it } from 'vitest'
import { createTimelineState } from './timeline'

/**
 * Timeline undo/redo contract tests. These lock in the behaviors users rely
 * on: one gesture = one undo step, loads are document boundaries, no-op
 * operations never cost an undo press, and the stack stays bounded.
 */
describe('timeline undo/redo', () => {
  let timeline: ReturnType<typeof createTimelineState>
  // Backing values for the resolver used by addKeyframe(s)AtCurrentFrame.
  let values: Record<string, number>

  const trackFor = (path: string) =>
    timeline.tracks().find((t) => t.parameterPath === path)

  beforeEach(() => {
    timeline = createTimelineState()
    values = { 't.a': 1, 't.b': 2, 't.d': 3, 't.e': 4, exposure: 0.5 }
    timeline.setValueResolver((path) => values[path] ?? null)
  })

  describe('basic round trips', () => {
    it('undoes and redoes an addKeyframe', () => {
      timeline.addKeyframe('exposure', 10, 0.5, 'linear')
      expect(trackFor('exposure')?.keyframes).toHaveLength(1)
      timeline.timelineUndo()
      expect(trackFor('exposure')).toBeUndefined()
      timeline.timelineRedo()
      expect(trackFor('exposure')?.keyframes).toHaveLength(1)
    })

    it('a new push clears redo', () => {
      timeline.addKeyframe('exposure', 10, 0.5, 'linear')
      timeline.timelineUndo()
      expect(timeline.hasTimelineRedo()).toBe(true)
      timeline.addKeyframe('exposure', 20, 0.7, 'linear')
      expect(timeline.hasTimelineRedo()).toBe(false)
    })

    it('caps the undo stack instead of growing without bound', () => {
      for (let frame = 0; frame < 130; frame++) {
        timeline.addKeyframe('exposure', frame, frame, 'linear')
      }
      let undos = 0
      while (timeline.hasTimelineUndo() && undos < 1000) {
        timeline.timelineUndo()
        undos++
      }
      expect(undos).toBe(100) // MAX_TIMELINE_UNDO
      // The oldest 30 pushes were evicted: the earliest keyframes remain.
      expect(trackFor('exposure')?.keyframes).toHaveLength(30)
    })
  })

  describe('no-op guards (a Ctrl+Z must never "do nothing")', () => {
    it('removeKeyframe on a missing keyframe records no undo entry', () => {
      timeline.removeKeyframe('exposure', 10)
      expect(timeline.hasTimelineUndo()).toBe(false)
    })

    it('removeKeyframe on a missing keyframe does not wipe redo', () => {
      timeline.addKeyframe('exposure', 10, 0.5, 'linear')
      timeline.timelineUndo()
      expect(timeline.hasTimelineRedo()).toBe(true)
      timeline.removeKeyframe('exposure', 99)
      expect(timeline.hasTimelineRedo()).toBe(true)
    })

    it('removeAllKeyframesForPath on a missing track records no undo entry', () => {
      timeline.removeAllKeyframesForPath('nope')
      expect(timeline.hasTimelineUndo()).toBe(false)
    })

    it('clearAllTracks on an empty timeline records no undo entry', () => {
      timeline.clearAllTracks()
      expect(timeline.hasTimelineUndo()).toBe(false)
    })
  })

  describe('addKeyframesAtCurrentFrame (grouped writes)', () => {
    it('writes several paths as ONE undo entry', () => {
      timeline.addKeyframesAtCurrentFrame(['t.a', 't.b', 't.d', 't.e'])
      expect(timeline.tracks()).toHaveLength(4)
      timeline.timelineUndo()
      expect(timeline.tracks()).toHaveLength(0)
      expect(timeline.hasTimelineUndo()).toBe(false)
    })

    it('skips unresolvable paths and does not push when none resolve', () => {
      timeline.addKeyframesAtCurrentFrame(['missing.a', 'missing.b'])
      expect(timeline.tracks()).toHaveLength(0)
      expect(timeline.hasTimelineUndo()).toBe(false)
    })

    it('coalesces per-pointer-move repeats into one undo step', () => {
      // Simulates a scrub: same path set, same frame, changing values.
      for (let move = 0; move < 50; move++) {
        values['t.a'] = move
        timeline.addKeyframesAtCurrentFrame(['t.a'])
      }
      expect(trackFor('t.a')?.keyframes[0]?.value).toBe(49)
      timeline.timelineUndo()
      // One undo reverts the entire scrub (back to no keyframes).
      expect(trackFor('t.a')).toBeUndefined()
      expect(timeline.hasTimelineUndo()).toBe(false)
    })

    it('multi-path gestures coalesce the same way (symmetry rotation)', () => {
      const paths = ['t.a', 't.b', 't.d', 't.e']
      for (let move = 0; move < 25; move++) {
        values['t.a'] = move
        timeline.addKeyframesAtCurrentFrame(paths)
      }
      timeline.timelineUndo()
      expect(timeline.tracks()).toHaveLength(0)
      expect(timeline.hasTimelineUndo()).toBe(false)
    })

    it('breakUndoCoalescing splits two gestures into two undo steps', () => {
      values['t.a'] = 10
      timeline.addKeyframesAtCurrentFrame(['t.a'])
      timeline.breakUndoCoalescing() // gesture end (pointer up)
      values['t.a'] = 20
      timeline.addKeyframesAtCurrentFrame(['t.a'])

      timeline.timelineUndo() // second gesture
      expect(trackFor('t.a')?.keyframes[0]?.value).toBe(10)
      timeline.timelineUndo() // first gesture
      expect(trackFor('t.a')).toBeUndefined()
    })

    it('moving the playhead breaks coalescing', () => {
      timeline.setConfig({ ...timeline.config(), endFrame: 90 })
      timeline.addKeyframesAtCurrentFrame(['t.a'])
      timeline.goToFrame(30)
      timeline.goToFrame(0)
      values['t.a'] = 99
      timeline.addKeyframesAtCurrentFrame(['t.a'])
      // Two entries: the seek in between must not merge the writes.
      timeline.timelineUndo()
      expect(trackFor('t.a')?.keyframes[0]?.value).toBe(1)
      timeline.timelineUndo()
      expect(trackFor('t.a')).toBeUndefined()
    })

    it('a different path set does not coalesce with the previous one', () => {
      timeline.addKeyframesAtCurrentFrame(['t.a'])
      timeline.addKeyframesAtCurrentFrame(['t.a', 't.b'])
      timeline.timelineUndo()
      expect(trackFor('t.b')).toBeUndefined()
      expect(trackFor('t.a')).toBeDefined()
      timeline.timelineUndo()
      expect(trackFor('t.a')).toBeUndefined()
    })

    it('coalesce: false keeps every write its own undo step (dice rolls)', () => {
      values['t.a'] = 10
      timeline.addKeyframesAtCurrentFrame(['t.a'], { coalesce: false })
      values['t.a'] = 20
      timeline.addKeyframesAtCurrentFrame(['t.a'], { coalesce: false })
      timeline.timelineUndo()
      expect(trackFor('t.a')?.keyframes[0]?.value).toBe(10)
      timeline.timelineUndo()
      expect(trackFor('t.a')).toBeUndefined()
    })

    it('a diamond toggle does not open a window later scrubs merge into', () => {
      // Deliberate click adds the keyframe...
      timeline.toggleKeyframeAtCurrentFrame('t.a')
      // ...then a scrub of the same param at the same frame must be a
      // SEPARATE undo step (undoing the scrub keeps the clicked keyframe).
      values['t.a'] = 42
      timeline.addKeyframesAtCurrentFrame(['t.a'])
      timeline.timelineUndo()
      expect(trackFor('t.a')?.keyframes[0]?.value).toBe(1)
      timeline.timelineUndo()
      expect(trackFor('t.a')).toBeUndefined()
    })
  })

  describe('runWithSingleUndo (bulk operations)', () => {
    it('collapses many addKeyframe pushes into one undo entry', () => {
      timeline.runWithSingleUndo(() => {
        for (let i = 0; i < 40; i++) {
          timeline.addKeyframe('exposure', i, i, 'linear')
        }
      })
      expect(trackFor('exposure')?.keyframes).toHaveLength(40)
      timeline.timelineUndo()
      expect(trackFor('exposure')).toBeUndefined()
      expect(timeline.hasTimelineUndo()).toBe(false)
    })

    it('includes clearAllTracks + rewrites in the same single step', () => {
      timeline.addKeyframe('exposure', 0, 1, 'linear')
      timeline.runWithSingleUndo(() => {
        timeline.clearAllTracks()
        timeline.addKeyframe('t.a', 0, 5, 'linear')
        timeline.addKeyframe('t.b', 45, 6, 'linear')
      })
      timeline.timelineUndo()
      // Back to exactly the pre-click state.
      expect(timeline.tracks()).toHaveLength(1)
      expect(trackFor('exposure')?.keyframes[0]?.value).toBe(1)
    })

    it('nested groups join the outermost (still one entry)', () => {
      timeline.runWithSingleUndo(() => {
        timeline.addKeyframe('exposure', 0, 1, 'linear')
        timeline.runWithSingleUndo(() => {
          timeline.addKeyframe('t.a', 1, 2, 'linear')
        })
        timeline.addKeyframe('t.b', 2, 3, 'linear')
      })
      timeline.timelineUndo()
      expect(timeline.tracks()).toHaveLength(0)
      expect(timeline.hasTimelineUndo()).toBe(false)
    })

    it('returns the callback result and releases the group on throw', () => {
      expect(timeline.runWithSingleUndo(() => 7)).toBe(7)
      expect(() =>
        timeline.runWithSingleUndo(() => {
          throw new Error('boom')
        }),
      ).toThrow('boom')
      // Group must be closed: a later write pushes normally.
      timeline.addKeyframe('exposure', 0, 1, 'linear')
      expect(timeline.hasTimelineUndo()).toBe(true)
    })
  })

  describe('config undo', () => {
    it('round-trips a user config edit', () => {
      const fpsBefore = timeline.config().fps
      timeline.updateConfigUndoable({ fps: 12 })
      expect(timeline.config().fps).toBe(12)
      timeline.timelineUndo()
      expect(timeline.config().fps).toBe(fpsBefore)
      timeline.timelineRedo()
      expect(timeline.config().fps).toBe(12)
    })

    it('coalesces a scrub of the same control into one undo step', () => {
      const fpsBefore = timeline.config().fps
      for (let v = 10; v <= 40; v++) {
        timeline.updateConfigUndoable({ fps: v }, 'fps')
      }
      timeline.breakUndoCoalescing() // gesture end
      timeline.updateConfigUndoable({ fps: 50 }, 'fps') // second gesture
      timeline.timelineUndo()
      expect(timeline.config().fps).toBe(40)
      timeline.timelineUndo()
      expect(timeline.config().fps).toBe(fpsBefore)
      expect(timeline.hasTimelineUndo()).toBe(false)
    })

    it('seamless loop mode is undoable, including its endFrame rewrite', () => {
      timeline.setConfig({ ...timeline.config(), endFrame: 90 })
      // Last keyframe AT endFrame → seamless must extend past it.
      timeline.addKeyframe('exposure', 90, 1, 'linear')
      const endBefore = timeline.config().endFrame
      timeline.setLoopMode('seamless')
      expect(timeline.config().loopMode).toBe('seamless')
      expect(timeline.config().endFrame).toBeGreaterThan(endBefore)
      timeline.timelineUndo()
      expect(timeline.config().loopMode ?? 'off').toBe('off')
      expect(timeline.config().endFrame).toBe(endBefore)
    })

    it('an idempotent loop-mode set burns no undo entry', () => {
      timeline.setLoopMode('off') // already off
      expect(timeline.hasTimelineUndo()).toBe(false)
    })

    it('track-op undo restores the config captured with it', () => {
      timeline.updateConfigUndoable({ fps: 24 }) // entry 1
      timeline.addKeyframe('exposure', 0, 1, 'linear') // entry 2 (fps=24)
      timeline.timelineUndo() // undo keyframe — config stays at 24
      expect(timeline.config().fps).toBe(24)
      timeline.timelineUndo() // undo fps change
      expect(timeline.config().fps).not.toBe(24)
    })
  })

  describe('value write-back on undo/redo', () => {
    it('writes the restored value at the current frame back to the flame', () => {
      const written: [string, unknown][] = []
      timeline.setValueWriter((path, value) => written.push([path, value]))
      timeline.addKeyframe('exposure', 0, 1, 'linear') // write-through: 1
      timeline.addKeyframe('exposure', 0, 5, 'linear') // write-through: 5
      written.length = 0

      timeline.timelineUndo() // keyframe value back to 1
      expect(written).toEqual([['exposure', 1]])
      written.length = 0

      timeline.timelineRedo() // forward to 5 again
      expect(written).toEqual([['exposure', 5]])
    })

    it('does not write for tracks the swap removed (flame history owns them)', () => {
      const written: [string, unknown][] = []
      timeline.setValueWriter((path, value) => written.push([path, value]))
      timeline.addKeyframe('exposure', 0, 5, 'linear')
      written.length = 0

      timeline.timelineUndo() // track removed entirely
      expect(written).toEqual([])
    })

    it('does not write for tracks untouched by the swap', () => {
      const written: [string, unknown][] = []
      timeline.setValueWriter((path, value) => written.push([path, value]))
      timeline.addKeyframe('exposure', 0, 5, 'linear')
      timeline.addKeyframe('t.a', 0, 7, 'linear')
      written.length = 0

      timeline.timelineUndo() // only t.a is removed; exposure unchanged
      expect(written).toEqual([])
    })
  })

  describe('load boundaries', () => {
    it('loadTracks clears undo and redo stacks', () => {
      timeline.addKeyframe('exposure', 10, 0.5, 'linear')
      timeline.addKeyframe('exposure', 20, 0.7, 'linear')
      timeline.timelineUndo()
      expect(timeline.hasTimelineUndo()).toBe(true)
      expect(timeline.hasTimelineRedo()).toBe(true)

      timeline.loadTracks([
        {
          parameterPath: 'other.path',
          keyframes: [{ frame: 0, value: 1, easing: 'linear' }],
        },
      ])
      expect(timeline.hasTimelineUndo()).toBe(false)
      expect(timeline.hasTimelineRedo()).toBe(false)
      // Ctrl+Z right after a load must not resurrect the old flame's tracks.
      timeline.timelineUndo()
      expect(trackFor('other.path')).toBeDefined()
      expect(trackFor('exposure')).toBeUndefined()
    })

    it('loadTracks also breaks any open coalescing run', () => {
      timeline.addKeyframesAtCurrentFrame(['t.a'])
      timeline.loadTracks([])
      values['t.a'] = 5
      timeline.addKeyframesAtCurrentFrame(['t.a'])
      // The write after the load is a fresh entry on a fresh stack.
      expect(timeline.hasTimelineUndo()).toBe(true)
      timeline.timelineUndo()
      expect(timeline.tracks()).toHaveLength(0)
      expect(timeline.hasTimelineUndo()).toBe(false)
    })
  })
})
