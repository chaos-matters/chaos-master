import { beforeEach, describe, expect, it } from 'vitest'
import { TimelineSnapshotConfig } from '@/flame/schema/timeline'
import * as v from '@/valibot'
import { catmullRom } from './easing'
import { applyTracksToFlame, createTimelineState, resolveKeyframeValue, resolveLoopValue, } from './timeline'
import type { TimelineTrack } from './timeline'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

describe('Timeline Utilities', () => {
  let timeline: ReturnType<typeof createTimelineState>

  beforeEach(() => {
    timeline = createTimelineState()
  })

  describe('Keyframe Management', () => {
    describe('addKeyframe', () => {
      it('should add a keyframe with a number value', () => {
        timeline.addKeyframe('exposure', 10, 0.5, 'linear')
        const track = timeline
          .tracks()
          .find((t) => t.parameterPath === 'exposure')
        expect(track).toBeDefined()
        expect(track?.keyframes).toHaveLength(1)
        expect(track?.keyframes[0]).toEqual({
          frame: 10,
          value: 0.5,
          easing: 'linear',
        })
      })

      it('should add a keyframe with a string value', () => {
        timeline.addKeyframe('drawMode', 15, 'light', 'easeInOut')
        const track = timeline
          .tracks()
          .find((t) => t.parameterPath === 'drawMode')
        expect(track).toBeDefined()
        expect(track?.keyframes[0]).toEqual({
          frame: 15,
          value: 'light',
          easing: 'easeInOut',
        })
      })

      it('should add a keyframe with an array value', () => {
        timeline.addKeyframe('backgroundColor', 20, [1, 0, 0], 'linear')
        const track = timeline
          .tracks()
          .find((t) => t.parameterPath === 'backgroundColor')
        expect(track).toBeDefined()
        expect(track?.keyframes[0]).toEqual({
          frame: 20,
          value: [1, 0, 0],
          easing: 'linear',
        })
      })

      it('should update existing keyframe if frame already exists', () => {
        timeline.addKeyframe('exposure', 10, 0.5, 'linear')
        timeline.addKeyframe('exposure', 10, 0.75, 'easeOut')
        const track = timeline
          .tracks()
          .find((t) => t.parameterPath === 'exposure')
        expect(track).toBeDefined()
        expect(track?.keyframes).toHaveLength(1)
        expect(track?.keyframes[0]).toEqual({
          frame: 10,
          value: 0.75,
          easing: 'easeOut',
        })
      })
    })

    describe('removeKeyframe', () => {
      it('should remove keyframe at specific frame', () => {
        timeline.addKeyframe('exposure', 10, 0.5, 'linear')
        timeline.removeKeyframe('exposure', 10)
        // Track is removed when it has no keyframes
        const track = timeline
          .tracks()
          .find((t) => t.parameterPath === 'exposure')
        expect(track).toBeUndefined()
      })

      it('should do nothing if keyframe does not exist', () => {
        timeline.removeKeyframe('exposure', 10)
        expect(
          timeline.tracks().find((t) => t.parameterPath === 'exposure'),
        ).toBeUndefined()
      })

      it('should remove keyframe from track with multiple keyframes', () => {
        timeline.addKeyframe('exposure', 10, 0.5, 'linear')
        timeline.addKeyframe('exposure', 20, 0.75, 'easeInOut')
        timeline.addKeyframe('exposure', 30, 1.0, 'linear')
        timeline.removeKeyframe('exposure', 20)
        const track = timeline
          .tracks()
          .find((t) => t.parameterPath === 'exposure')
        expect(track).toBeDefined()
        expect(track?.keyframes).toHaveLength(2)
        expect(track?.keyframes[0]!.frame).toBe(10)
        expect(track?.keyframes[1]!.frame).toBe(30)
      })

      it('should filter out empty tracks', () => {
        timeline.addKeyframe('exposure', 10, 0.5, 'linear')
        timeline.removeKeyframe('exposure', 10)
        expect(
          timeline.tracks().find((t) => t.parameterPath === 'exposure'),
        ).toBeUndefined()
      })
    })

    describe('hasKeyframeAtFrame', () => {
      it('should return true if keyframe exists at frame', () => {
        timeline.addKeyframe('exposure', 10, 0.5, 'linear')
        expect(timeline.hasKeyframeAtFrame('exposure', 10)).toBe(true)
      })

      it('should return false if no keyframe at frame', () => {
        timeline.addKeyframe('exposure', 10, 0.5, 'linear')
        expect(timeline.hasKeyframeAtFrame('exposure', 20)).toBe(false)
      })

      it('should return false for non-existent track', () => {
        expect(timeline.hasKeyframeAtFrame('nonexistent', 10)).toBe(false)
      })
    })

    describe('getKeyframeAtFrame', () => {
      it('should return keyframe if exists', () => {
        const keyframe = { frame: 10, value: 0.5, easing: 'linear' }
        timeline.addKeyframe('exposure', 10, 0.5, 'linear')
        const found = timeline.getKeyframeAtFrame('exposure', 10)
        expect(found).toEqual(keyframe)
      })

      it('should return undefined if no keyframe', () => {
        expect(timeline.getKeyframeAtFrame('exposure', 10)).toBeUndefined()
      })
    })
  })

  describe('Keyframe Overlap Detection', () => {
    describe('getOverlappingKeyframes', () => {
      it('should return all keyframes at overlapping frame', () => {
        timeline.addKeyframe('exposure', 10, 0.5, 'linear')
        // Adding keyframe at existing frame updates existing one
        timeline.addKeyframe('exposure', 10, 0.75, 'easeInOut')
        timeline.addKeyframe('exposure', 20, 1.0, 'linear')
        // Only 2 unique frames: 10 and 20
        const overlapping = timeline.getOverlappingKeyframes('exposure', 10)
        expect(overlapping).toHaveLength(1)
        expect(overlapping[0]?.frame).toBe(10)
        expect(overlapping[0]?.value).toBe(0.75) // Updated value
      })

      it('should return empty array if no overlapping frames', () => {
        timeline.addKeyframe('exposure', 10, 0.5, 'linear')
        const overlapping = timeline.getOverlappingKeyframes('exposure', 20)
        expect(overlapping).toHaveLength(0)
      })

      it('should return keyframes even with different types', () => {
        timeline.addKeyframe('exposure', 10, 0.5, 'linear')
        timeline.addKeyframe('drawMode', 10, 'light', 'easeInOut')
        const overlapping = timeline.getOverlappingKeyframes('exposure', 10)
        expect(overlapping).toHaveLength(1)
      })
    })

    describe('addKeyframeWithOverlapCheck', () => {
      it('should return false and not add keyframe if overlap detected', () => {
        timeline.addKeyframe('exposure', 10, 0.5, 'linear')
        const added = timeline.addKeyframeWithOverlapCheck(
          'exposure',
          10,
          0.75,
          'easeInOut',
        )
        expect(added).toBe(false)
        const track = timeline
          .tracks()
          .find((t) => t.parameterPath === 'exposure')
        expect(track?.keyframes).toHaveLength(1)
      })

      it('should return true and add keyframe if no overlap', () => {
        timeline.addKeyframe('exposure', 10, 0.5, 'linear')
        const added = timeline.addKeyframeWithOverlapCheck(
          'exposure',
          20,
          0.75,
          'easeInOut',
        )
        expect(added).toBe(true)
        const track = timeline
          .tracks()
          .find((t) => t.parameterPath === 'exposure')
        expect(track?.keyframes).toHaveLength(2)
      })
    })

    describe('splitKeyframeAtFrame', () => {
      it('should split keyframe at specified frame', () => {
        timeline.addKeyframe('exposure', 15, 0.5, 'linear')
        const split = timeline.splitKeyframeAtFrame('exposure', 15, 10)
        expect(split).toBe(true)
        const track = timeline
          .tracks()
          .find((t) => t.parameterPath === 'exposure')
        expect(track?.keyframes).toHaveLength(2)
        // Keyframes are added: first at originalFrame (15), then at splitFrame (10)
        // So keyframes[0] is at frame 15, keyframes[1] is at frame 10
        expect(track?.keyframes[0]!.frame).toBe(15)
        expect(track?.keyframes[1]!.frame).toBe(10)
      })

      it('should return false if keyframe does not exist', () => {
        const split = timeline.splitKeyframeAtFrame('exposure', 10, 15)
        expect(split).toBe(false)
      })

      it('should handle boolean values correctly', () => {
        timeline.addKeyframe('colorInitMode', 15, 'colorInitZero', 'linear')
        const split = timeline.splitKeyframeAtFrame('colorInitMode', 15, 10)
        expect(split).toBe(true)
      })
    })

    describe('getTracksWithFrameOverlap', () => {
      it('should return tracks that have keyframes at overlapping frame', () => {
        timeline.addKeyframe('exposure', 10, 0.5, 'linear')
        timeline.addKeyframe('drawMode', 10, 'light', 'easeInOut')
        const overlapping = timeline.getTracksWithFrameOverlap(10)
        expect(overlapping).toContain('exposure')
        expect(overlapping).toContain('drawMode')
      })

      it('should return empty array if no overlapping frames', () => {
        const overlapping = timeline.getTracksWithFrameOverlap(10)
        expect(overlapping).toHaveLength(0)
      })
    })
  })

  describe('Mirror Functionality', () => {
    describe('mirrorKeyframeToOpposite', () => {
      beforeEach(() => {
        timeline.setConfig({
          fps: 30,
          timeScale: 1,
          startFrame: 0,
          endFrame: 90,
          loop: true,
        })
      })

      it('should mirror frame from middle to opposite side', () => {
        const mirrored = timeline.mirrorKeyframeToOpposite('exposure', 45)
        expect(mirrored).toBe(45)
      })

      it('should mirror frame near start', () => {
        const mirrored = timeline.mirrorKeyframeToOpposite('exposure', 10)
        expect(mirrored).toBe(80)
      })

      it('should mirror frame near end', () => {
        const mirrored = timeline.mirrorKeyframeToOpposite('exposure', 80)
        expect(mirrored).toBe(10)
      })

      it('should return null for invalid mirrored frame', () => {
        const mirrored = timeline.mirrorKeyframeToOpposite('exposure', -1)
        expect(mirrored).toBeNull()
      })

      it('should handle start frame', () => {
        const mirrored = timeline.mirrorKeyframeToOpposite('exposure', 0)
        expect(mirrored).toBe(90)
      })

      it('should handle end frame', () => {
        const mirrored = timeline.mirrorKeyframeToOpposite('exposure', 90)
        expect(mirrored).toBe(0)
      })
    })

    describe('applyMirroredValueFromTrack', () => {
      beforeEach(() => {
        timeline.setConfig({
          fps: 30,
          timeScale: 1,
          startFrame: 0,
          endFrame: 90,
          loop: true,
        })
      })

      it('should apply mirrored value to target track', () => {
        timeline.addKeyframe('exposure', 45, 0.5, 'easeInOut')
        const applied = timeline.applyMirroredValueFromTrack(
          'exposure',
          'vibrancy',
          45,
        )
        expect(applied).toBe(true)
        const track = timeline
          .tracks()
          .find((t) => t.parameterPath === 'vibrancy')
        expect(track?.keyframes).toHaveLength(1)
        expect(track?.keyframes[0]!.frame).toBe(45)
        expect(track?.keyframes[0]!.value).toBe(0.5)
      })

      it('should return false if source keyframe does not exist', () => {
        const applied = timeline.applyMirroredValueFromTrack(
          'exposure',
          'vibrancy',
          45,
        )
        expect(applied).toBe(false)
      })

      it('should return false if source value is boolean', () => {
        // Boolean keyframes cannot be used for mirroring
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        timeline.addKeyframe('exposure', 45, true as any, 'linear')
        const applied = timeline.applyMirroredValueFromTrack(
          'exposure',
          'vibrancy',
          45,
        )
        expect(applied).toBe(false)
      })

      it('should return true for string value (creates target track)', () => {
        // String values ARE allowed to be mirrored
        timeline.addKeyframe('colorInitMode', 45, 'colorInitZero', 'linear')
        const applied = timeline.applyMirroredValueFromTrack(
          'colorInitMode',
          'drawMode',
          45,
        )
        expect(applied).toBe(true)
      })
    })
  })

  describe('Value Resolution', () => {
    it('should resolve value from single keyframe', () => {
      timeline.addKeyframe('exposure', 10, 0.5, 'linear')
      const value = timeline.resolveValueAtPath('exposure', 10)
      expect(value).toBe(0.5)
    })

    it('should interpolate between keyframes', () => {
      timeline.addKeyframe('exposure', 0, 0.0, 'linear')
      timeline.addKeyframe('exposure', 90, 1.0, 'linear')
      const value = timeline.resolveValueAtPath('exposure', 45)
      expect(value).toBe(0.5)
    })

    it('should use easeIn interpolation', () => {
      timeline.addKeyframe('exposure', 0, 0.0, 'linear')
      timeline.addKeyframe('exposure', 90, 1.0, 'easeIn')
      const t = 0.5
      const expected = t * t * t // easeIn at t=0.5
      const value = timeline.resolveValueAtPath('exposure', 45)
      expect(value).toBeCloseTo(expected, 10)
    })

    it('should use easeOut interpolation', () => {
      timeline.addKeyframe('exposure', 0, 0.0, 'linear')
      timeline.addKeyframe('exposure', 90, 1.0, 'easeOut')
      const t = 0.5
      const expected = 1 - (1 - t) ** 3 // easeOut at t=0.5
      const value = timeline.resolveValueAtPath('exposure', 45)
      expect(value).toBeCloseTo(expected, 10)
    })

    it('should use easeInOut interpolation', () => {
      timeline.addKeyframe('exposure', 0, 0.0, 'linear')
      timeline.addKeyframe('exposure', 90, 1.0, 'easeInOut')
      const expected = 0.5 // easeInOut at t=0.5
      const value = timeline.resolveValueAtPath('exposure', 45)
      expect(value).toBeCloseTo(expected, 10)
    })

    it('should use bounce interpolation', () => {
      timeline.addKeyframe('exposure', 0, 0.0, 'linear')
      timeline.addKeyframe('exposure', 90, 1.0, 'bounce')
      // bounce(0.5) ≈ 0.765625 based on the bounce easing function
      const expected = 0.765625
      const value = timeline.resolveValueAtPath('exposure', 45)
      expect(value).toBeCloseTo(expected, 10)
    })

    it('should use elastic interpolation', () => {
      timeline.addKeyframe('exposure', 0, 0.0, 'linear')
      timeline.addKeyframe('exposure', 90, 1.0, 'elastic')
      // elastic(0.5) formula
      const t = 0.5
      const c4 = (2 * Math.PI) / 3
      const expected = Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
      const value = timeline.resolveValueAtPath('exposure', 45)
      expect(value).toBeCloseTo(expected, 10)
    })

    it('should return null for non-existent track', () => {
      const value = timeline.resolveValueAtPath('nonexistent', 10)
      expect(value).toBeNull()
    })

    it('should handle array values', () => {
      timeline.addKeyframe('backgroundColor', 10, [1, 0, 0], 'linear')
      const value = timeline.resolveValueAtPath('backgroundColor', 10)
      expect(value).toEqual([1, 0, 0])
    })
  })

  describe('Playback Controls', () => {
    beforeEach(() => {
      timeline.setConfig({
        fps: 30,
        timeScale: 1,
        startFrame: 0,
        endFrame: 90,
        loop: true,
      })
    })

    describe('advanceFrame', () => {
      it('should advance to next frame', () => {
        timeline.setCurrentFrame(0)
        timeline.advanceFrame()
        expect(timeline.currentFrame()).toBe(1)
      })

      it('should wrap to start frame when at end', () => {
        timeline.setCurrentFrame(90)
        timeline.advanceFrame()
        expect(timeline.currentFrame()).toBe(0)
      })

      it('should loop with loop enabled', () => {
        timeline.setConfig({ ...timeline.config(), loop: true })
        timeline.setCurrentFrame(90)
        timeline.advanceFrame()
        expect(timeline.currentFrame()).toBe(0)
      })

      it('should return to start frame and stop playing when loop disabled', () => {
        timeline.setConfig({ ...timeline.config(), loop: false })
        timeline.setIsPlaying(true)
        timeline.setCurrentFrame(90)
        timeline.advanceFrame()
        expect(timeline.currentFrame()).toBe(0)
        expect(timeline.isPlaying()).toBe(false)
      })
    })

    describe('goBackFrame', () => {
      it('should go back one frame', () => {
        timeline.setCurrentFrame(10)
        timeline.goBackFrame()
        expect(timeline.currentFrame()).toBe(9)
      })

      it('should wrap to end frame when at start', () => {
        timeline.setCurrentFrame(0)
        timeline.goBackFrame()
        expect(timeline.currentFrame()).toBe(90)
      })

      it('should loop with loop enabled', () => {
        timeline.setConfig({ ...timeline.config(), loop: true })
        timeline.setCurrentFrame(0)
        timeline.goBackFrame()
        expect(timeline.currentFrame()).toBe(90)
      })
    })

    describe('goToFrame', () => {
      it('should go to specified frame', () => {
        timeline.setCurrentFrame(10)
        timeline.goToFrame(50)
        expect(timeline.currentFrame()).toBe(50)
      })

      it('should clamp to start frame', () => {
        timeline.goToFrame(-1)
        expect(timeline.currentFrame()).toBe(0)
      })

      it('should clamp to end frame', () => {
        timeline.goToFrame(100)
        expect(timeline.currentFrame()).toBe(90)
      })
    })

    describe('play/pause', () => {
      it('should start playing', () => {
        timeline.play()
        expect(timeline.isPlaying()).toBe(true)
      })

      it('should pause when already playing', () => {
        timeline.play()
        timeline.pause()
        expect(timeline.isPlaying()).toBe(false)
      })

      it('should toggle play/pause', () => {
        timeline.togglePlay()
        expect(timeline.isPlaying()).toBe(true)
        timeline.togglePlay()
        expect(timeline.isPlaying()).toBe(false)
      })
    })

    // Note: timeScale support not yet implemented - test would be:
    // describe('timeScale', () => {
    //   it('should advance multiple frames per animation tick', () => {
    //     timeline.setCurrentFrame(0)
    //     setTimeScale(2)
    //     timeline.advanceFrame()
    //     expect(timeline.currentFrame()).toBe(2)
    //   })
    // })
  })

  describe('getAllTrackFrames', () => {
    it('should return all unique frame numbers from all tracks', () => {
      timeline.addKeyframe('exposure', 10, 0.5, 'linear')
      timeline.addKeyframe('exposure', 20, 0.75, 'linear')
      timeline.addKeyframe('drawMode', 15, 'light', 'linear')
      timeline.addKeyframe('drawMode', 20, 'paint', 'linear')
      const frames = timeline.getKeysForFrame(20)
      expect(frames.exposure).toBe(true)
      expect(frames.drawMode).toBe(true)
    })
  })

  describe('findClosestKeyframeBeforeFrame', () => {
    it('should find closest keyframe at or before frame', () => {
      timeline.addKeyframe('exposure', 10, 0.5, 'linear')
      timeline.addKeyframe('exposure', 30, 0.75, 'linear')
      // For frame 25, keyframe at 10 is closest (at or before 25)
      const found = timeline.findClosestKeyframeBeforeFrame('exposure', 25)
      expect(found?.frame).toBe(10)
    })

    it('should find keyframe at exact frame when it exists', () => {
      timeline.addKeyframe('exposure', 30, 0.75, 'linear')
      const found = timeline.findClosestKeyframeBeforeFrame('exposure', 30)
      expect(found?.frame).toBe(30)
    })

    it('should return undefined for frame before first keyframe', () => {
      timeline.addKeyframe('exposure', 30, 0.75, 'linear')
      const found = timeline.findClosestKeyframeBeforeFrame('exposure', 10)
      expect(found).toBeUndefined()
    })

    it('should return first keyframe for frame at or after first keyframe', () => {
      timeline.addKeyframe('exposure', 10, 0.5, 'linear')
      const found = timeline.findClosestKeyframeBeforeFrame('exposure', 10)
      expect(found?.frame).toBe(10)
    })
  })

  describe('loop modes (toggle, no baking)', () => {
    it('seamless: adds no keyframes, enables loop, extends endFrame by span', () => {
      timeline.setConfig({ ...timeline.config(), startFrame: 0, endFrame: 40 })
      timeline.addKeyframe('exposure', 0, 0.2, 'linear')
      timeline.addKeyframe('exposure', 40, 0.9, 'linear')
      const before = timeline.tracks()[0]!.keyframes.length

      timeline.setLoopMode('seamless')

      expect(timeline.config().loopMode).toBe('seamless')
      expect(timeline.config().loop).toBe(true)
      // userEnd = 40, span = 40 → endFrame extended to 80 (uniform return).
      expect(timeline.config().endFrame).toBe(80)
      expect(timeline.tracks()[0]!.keyframes).toHaveLength(before)
    })

    it('seamless never extends past a frame the config can be stored at', () => {
      // The extension IS the document: it is what the stored timeline says
      // the animation is. Past the schema's maximum the whole config fails
      // validation on the way back in, so the entry reloads at the default
      // 30fps over 90 frames - after Save for Later reported success and
      // marked the workspace clean, so nothing ever retried.
      timeline.setConfig({
        ...timeline.config(),
        startFrame: 0,
        endFrame: 1200,
      })
      timeline.addKeyframe('exposure', 0, 0.2, 'linear')
      timeline.addKeyframe('exposure', 1200, 0.9, 'linear')

      timeline.setLoopMode('seamless')

      expect(
        v.safeParse(TimelineSnapshotConfig, timeline.config()).success,
      ).toBe(true)
      expect(timeline.config().endFrame).toBe(2000)
    })

    it('seamless is idempotent — re-selecting does not pile up frames', () => {
      timeline.addKeyframe('exposure', 0, 0.2, 'linear')
      timeline.addKeyframe('exposure', 40, 0.9, 'linear')
      timeline.setLoopMode('seamless')
      const extendedEnd = timeline.config().endFrame
      timeline.setLoopMode('off')
      timeline.setLoopMode('seamless')
      expect(timeline.config().endFrame).toBe(extendedEnd)
    })

    it('cycle: enables loop and never extends endFrame', () => {
      timeline.setConfig({ ...timeline.config(), startFrame: 0, endFrame: 60 })
      timeline.addKeyframe('exposure', 0, 0.2, 'linear')
      timeline.addKeyframe('exposure', 40, 0.9, 'linear')
      timeline.setLoopMode('cycle')
      expect(timeline.config().loopMode).toBe('cycle')
      expect(timeline.config().loop).toBe(true)
      expect(timeline.config().endFrame).toBe(60)
    })

    it('seamless resolves endFrame back to the start value', () => {
      timeline.setConfig({ ...timeline.config(), startFrame: 0, endFrame: 60 })
      timeline.addKeyframe('exposure', 0, 0.2, 'linear')
      timeline.addKeyframe('exposure', 40, 0.9, 'linear')
      timeline.setLoopMode('seamless')
      expect(timeline.resolveValueAtPath('exposure', 40)).toBeCloseTo(0.9)
      expect(timeline.resolveValueAtPath('exposure', 60)).toBeCloseTo(0.2)
    })

    it('cycle resolves start and end to the same value (seamless wrap)', () => {
      timeline.setConfig({ ...timeline.config(), startFrame: 0, endFrame: 60 })
      // First keyframe is NOT at frame 0 — the wrap must still close.
      timeline.addKeyframe('exposure', 10, 0.2, 'linear')
      timeline.addKeyframe('exposure', 40, 0.9, 'linear')
      timeline.setLoopMode('cycle')
      const atStart = timeline.resolveValueAtPath('exposure', 0) as number
      const atEnd = timeline.resolveValueAtPath('exposure', 60) as number
      expect(atEnd).toBeCloseTo(atStart)
    })

    it('off leaves resolution unchanged', () => {
      timeline.setConfig({ ...timeline.config(), startFrame: 0, endFrame: 60 })
      timeline.addKeyframe('exposure', 0, 0.2, 'linear')
      timeline.addKeyframe('exposure', 40, 0.9, 'linear')
      expect(timeline.resolveValueAtPath('exposure', 60)).toBeCloseTo(0.9)
    })
  })

  describe('a config the app can always store', () => {
    // Whatever the workspace is holding has to survive the round trip
    // through Recents, or "saved" is a claim about work that is not there.
    it('clamps a length typed past the maximum', () => {
      // The Frames input has no maximum of its own: the scrubber stops at
      // 999 but a typed value goes straight in.
      timeline.setConfig({ ...timeline.config(), endFrame: 2500 })
      expect(timeline.config().endFrame).toBe(2000)
      expect(
        v.safeParse(TimelineSnapshotConfig, timeline.config()).success,
      ).toBe(true)
    })

    it('clamps a frame rate and a speed out of range', () => {
      timeline.setConfig({ ...timeline.config(), fps: 0, timeScale: 99 })
      expect(timeline.config().fps).toBe(1)
      expect(timeline.config().timeScale).toBe(10)
      expect(
        v.safeParse(TimelineSnapshotConfig, timeline.config()).success,
      ).toBe(true)
    })

    it('falls back to the default for a value that is not a number', () => {
      // A speed clamped to the low end of its range is a timeline frozen at
      // zero, which reads as the app hanging rather than as a value being
      // rejected. So a value that is not a number at all takes the field's
      // default instead of its floor. An emptied number input is a different
      // case: it sends 0, which is a number, and clamps into range.
      timeline.setConfig({
        ...timeline.config(),
        fps: Number.NaN,
        timeScale: Number.NaN,
        endFrame: Number.NaN,
      })
      expect(timeline.config().fps).toBe(30)
      expect(timeline.config().timeScale).toBe(1)
      expect(timeline.config().endFrame).toBe(90)

      timeline.setConfig({ ...timeline.config(), fps: 0, endFrame: 0 })
      expect(timeline.config().fps).toBe(1)
      expect(timeline.config().endFrame).toBe(1)
      expect(
        v.safeParse(TimelineSnapshotConfig, timeline.config()).success,
      ).toBe(true)
    })

    it('leaves an ordinary config exactly as it was', () => {
      const next = {
        ...timeline.config(),
        fps: 24,
        timeScale: 1.5,
        startFrame: 10,
        endFrame: 120,
      }
      timeline.setConfig(next)
      expect(timeline.config()).toEqual(next)
    })
  })

  describe('resolveLoopValue', () => {
    const kfs = [
      { frame: 0, value: 0, easing: 'linear' as const },
      { frame: 40, value: 10, easing: 'linear' as const },
    ]

    it('equals resolveKeyframeValue when opts is null', () => {
      expect(resolveLoopValue(kfs, 20, null)).toBe(
        resolveKeyframeValue(kfs, 20),
      )
    })

    it('seamless ramps from the held end value back to the start value', () => {
      const opts = {
        mode: 'seamless' as const,
        startFrame: 0,
        endFrame: 60,
        userEnd: 40,
      }
      expect(resolveLoopValue(kfs, 40, opts)).toBeCloseTo(10) // held
      expect(resolveLoopValue(kfs, 60, opts)).toBeCloseTo(0) // back to start
      const mid = resolveLoopValue(kfs, 50, opts) as number
      expect(mid).toBeGreaterThan(0)
      expect(mid).toBeLessThan(10)
    })

    it('cycle interior interpolates normally', () => {
      const opts = { mode: 'cycle' as const, startFrame: 0, endFrame: 60 }
      // frame 20 is between kf 0 and 40 → 5.0 (linear).
      expect(resolveLoopValue(kfs, 20, opts)).toBeCloseTo(5)
    })

    it('cycle wraps the last keyframe back to the first across the period', () => {
      // kf at 10 and 40, period [0,60]. Wrap segment 40 → (10 + 60) = 70.
      const k = [
        { frame: 10, value: 2, easing: 'linear' as const },
        { frame: 40, value: 8, easing: 'linear' as const },
      ]
      const opts = { mode: 'cycle' as const, startFrame: 0, endFrame: 60 }
      // Halfway through the wrap (frame 55) → midpoint of 8 → 2.
      expect(resolveLoopValue(k, 55, opts)).toBeCloseTo(5)
      // start and end resolve equal.
      expect(resolveLoopValue(k, 0, opts)).toBeCloseTo(
        resolveLoopValue(k, 60, opts) as number,
      )
    })
  })

  describe('spline (Catmull-Rom) interpolation', () => {
    it('catmullRom passes through p1 at t=0 and p2 at t=1', () => {
      expect(catmullRom(0, 1, 2, 3, 0)).toBeCloseTo(1)
      expect(catmullRom(0, 1, 2, 3, 1)).toBeCloseTo(2)
    })

    it('catmullRom of collinear points equals the linear midpoint', () => {
      // p0..p3 = 0,1,2,3 → at t=0.5 the value is 1.5 (no curvature).
      expect(catmullRom(0, 1, 2, 3, 0.5)).toBeCloseTo(1.5)
    })

    const splineKfs = [
      { frame: 0, value: 0, interp: 'spline' as const },
      { frame: 10, value: 10, interp: 'spline' as const },
      { frame: 20, value: 0, interp: 'spline' as const },
    ]

    it('passes through keyframes exactly', () => {
      expect(resolveKeyframeValue(splineKfs, 0)).toBeCloseTo(0)
      expect(resolveKeyframeValue(splineKfs, 10)).toBeCloseTo(10)
      expect(resolveKeyframeValue(splineKfs, 20)).toBeCloseTo(0)
    })

    it('curves away from the straight line between keyframes', () => {
      // Over a hump (0→10→0), the spline at the segment midpoint overshoots the
      // linear value (5).
      const v = resolveKeyframeValue(splineKfs, 5) as number
      expect(v).toBeGreaterThan(5)
    })

    it("'linear' interp is identical to the previous lerp behaviour", () => {
      const lin = [
        { frame: 0, value: 0, interp: 'linear' as const },
        { frame: 10, value: 10, interp: 'linear' as const },
      ]
      expect(resolveKeyframeValue(lin, 3)).toBeCloseTo(3)
      expect(resolveKeyframeValue(lin, 7)).toBeCloseTo(7)
    })

    it("'constant' interp holds the previous value", () => {
      const step = [
        { frame: 0, value: 2, interp: 'constant' as const },
        { frame: 10, value: 8, interp: 'constant' as const },
      ]
      // 'constant' is read from the *next* keyframe (segment owner).
      expect(resolveKeyframeValue(step, 5)).toBeCloseTo(2)
      expect(resolveKeyframeValue(step, 9.9)).toBeCloseTo(2)
      expect(resolveKeyframeValue(step, 10)).toBeCloseTo(8)
    })

    it('interpolates array (colour) values with spline', () => {
      const arr = [
        {
          frame: 0,
          value: [0, 0, 0] as [number, number, number],
          interp: 'spline' as const,
        },
        {
          frame: 10,
          value: [1, 1, 1] as [number, number, number],
          interp: 'spline' as const,
        },
      ]
      const v = resolveKeyframeValue(arr, 5) as number[]
      expect(v).toHaveLength(3)
      expect(v[0]).toBeGreaterThan(0)
      expect(v[0]).toBeLessThan(1)
    })
  })

  describe('keyframe interp metadata', () => {
    it('setKeyframeInterp sets the mode and preserves value + easing', () => {
      timeline.addKeyframe('exposure', 10, 0.5, 'easeIn')
      timeline.setKeyframeInterp('exposure', 10, 'spline')
      const kf = timeline.getKeyframeAtFrame('exposure', 10)
      expect(kf?.interp).toBe('spline')
      expect(kf?.value).toBe(0.5)
      expect(kf?.easing).toBe('easeIn')
    })

    it('is preserved across a value change and an easing change', () => {
      timeline.addKeyframe('exposure', 10, 0.5)
      timeline.setKeyframeInterp('exposure', 10, 'spline')
      // value scrub
      timeline.setKeyframeValue('exposure', 10, 0.8)
      expect(timeline.getKeyframeAtFrame('exposure', 10)?.interp).toBe('spline')
      // easing change
      timeline.addKeyframe('exposure', 10, 0.8, 'bounce')
      const kf = timeline.getKeyframeAtFrame('exposure', 10)
      expect(kf?.interp).toBe('spline')
      expect(kf?.easing).toBe('bounce')
    })

    it('is preserved when a keyframe is moved', () => {
      timeline.addKeyframe('exposure', 10, 0.5)
      timeline.setKeyframeInterp('exposure', 10, 'spline')
      timeline.moveKeyframe('exposure', 10, 25)
      expect(timeline.getKeyframeAtFrame('exposure', 25)?.interp).toBe('spline')
    })
  })

  describe('applyTracksToFlame', () => {
    function createMockFlame(dimensions: 2 | 3 = 2): FlameDescriptor {
      return {
        version: '1.0.0',
        metadata: { name: 'Test Flame' },
        renderSettings: {
          dimensions,
          exposure: 1.0,
          vibrancy: 1.0,
          contrast: 1.0,
          gamma: 2.2,
          skipIters: 1,
          highlightPower: 1.0,
          depthColorPower: 1.0,
          lightPower: 1.0,
          palettePhase: 0.0,
          paletteSpeed: 1.0,
          densityEstimationQuality: 1.0,
          estimatorCurve: 1.0,
          drawMode: 'light',
          colorInitMode: 'colorInitZero',
          pointInitMode: 'pointInitOrigin',
          camera: {
            position: [0, 0],
            zoom: 1.0,
            rotation: 0.0,
          },
          ...(dimensions === 3
            ? {
                camera3D: {
                  theta: 0,
                  phi: 1.0,
                  radius: 5.0,
                  fov: 60,
                  target: [0, 0, 0],
                  roll: 0,
                },
              }
            : {}),
        },
        transforms: {
          t1: {
            probability: 1.0,
            colorSpeed: 1.0,
            color: { x: 0.5, y: 0.5 },
            preAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
            postAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
            variations: {
              linearT: { type: 'linearT', weight: 1.0 },
              spherical: {
                type: 'spherical',
                weight: 0.5,
                params: { strength: 1.0 },
              },
            },
          },
        },
      } as unknown as FlameDescriptor
    }

    it('applies 2D camera tracks correctly', () => {
      const flame = createMockFlame(2)
      const tracks: TimelineTrack[] = [
        { parameterPath: 'camera.x', keyframes: [{ frame: 0, value: 1.5 }] },
        { parameterPath: 'camera.y', keyframes: [{ frame: 0, value: -2.5 }] },
        { parameterPath: 'camera.zoom', keyframes: [{ frame: 0, value: 3.0 }] },
        {
          parameterPath: 'camera.rotation',
          keyframes: [{ frame: 0, value: 0.75 }],
        },
      ]

      applyTracksToFlame(tracks, flame, 0)

      expect(flame.renderSettings.camera?.position[0]).toBe(1.5)
      expect(flame.renderSettings.camera?.position[1]).toBe(-2.5)
      expect(flame.renderSettings.camera?.zoom).toBe(3.0)
      expect(flame.renderSettings.camera?.rotation).toBe(0.75)
    })

    it('applies 3D camera tracks correctly', () => {
      const flame = createMockFlame(3)
      const tracks: TimelineTrack[] = [
        {
          parameterPath: 'camera3D.theta',
          keyframes: [{ frame: 0, value: 0.45 }],
        },
        {
          parameterPath: 'camera3D.phi',
          keyframes: [{ frame: 0, value: 1.85 }],
        },
        {
          parameterPath: 'camera3D.radius',
          keyframes: [{ frame: 0, value: 8.5 }],
        },
        {
          parameterPath: 'camera3D.fov',
          keyframes: [{ frame: 0, value: 75.0 }],
        },
      ]

      applyTracksToFlame(tracks, flame, 0)

      expect(flame.renderSettings.camera3D?.theta).toBe(0.45)
      expect(flame.renderSettings.camera3D?.phi).toBe(1.85)
      expect(flame.renderSettings.camera3D?.radius).toBe(8.5)
      expect(flame.renderSettings.camera3D?.fov).toBe(75.0)
    })

    it('applies render settings tracks correctly including color arrays', () => {
      const flame = createMockFlame(2)
      const tracks: TimelineTrack[] = [
        { parameterPath: 'exposure', keyframes: [{ frame: 0, value: 2.5 }] },
        { parameterPath: 'skipIters', keyframes: [{ frame: 0, value: 3 }] },
        { parameterPath: 'vibrancy', keyframes: [{ frame: 0, value: 0.8 }] },
        { parameterPath: 'contrast', keyframes: [{ frame: 0, value: 1.4 }] },
        { parameterPath: 'gamma', keyframes: [{ frame: 0, value: 1.8 }] },
        {
          parameterPath: 'highlightPower',
          keyframes: [{ frame: 0, value: 0.9 }],
        },
        {
          parameterPath: 'depthColorPower',
          keyframes: [{ frame: 0, value: 1.1 }],
        },
        { parameterPath: 'lightPower', keyframes: [{ frame: 0, value: 0.7 }] },
        {
          parameterPath: 'palettePhase',
          keyframes: [{ frame: 0, value: 0.33 }],
        },
        {
          parameterPath: 'paletteSpeed',
          keyframes: [{ frame: 0, value: 2.0 }],
        },
        {
          parameterPath: 'densityEstimationQuality',
          keyframes: [{ frame: 0, value: 4.0 }],
        },
        {
          parameterPath: 'estimatorCurve',
          keyframes: [{ frame: 0, value: 0.6 }],
        },
        {
          parameterPath: 'drawMode',
          keyframes: [{ frame: 0, value: 'paint' }],
        },
        {
          parameterPath: 'colorInitMode',
          keyframes: [{ frame: 0, value: 'colorInitPosition' }],
        },
        {
          parameterPath: 'pointInitMode',
          keyframes: [{ frame: 0, value: 'pointInitRandom' }],
        },
        {
          parameterPath: 'backgroundColor',
          keyframes: [{ frame: 0, value: [0.1, 0.2, 0.3] }],
        },
        {
          parameterPath: 'edgeFadeColor',
          keyframes: [{ frame: 0, value: [0.4, 0.5, 0.6, 0.7] }],
        },
      ]

      applyTracksToFlame(tracks, flame, 0)

      expect(flame.renderSettings.exposure).toBe(2.5)
      expect(flame.renderSettings.skipIters).toBe(3)
      expect(flame.renderSettings.vibrancy).toBe(0.8)
      expect(flame.renderSettings.contrast).toBe(1.4)
      expect(flame.renderSettings.gamma).toBe(1.8)
      expect(flame.renderSettings.highlightPower).toBe(0.9)
      expect(flame.renderSettings.depthColorPower).toBe(1.1)
      expect(flame.renderSettings.lightPower).toBe(0.7)
      expect(flame.renderSettings.palettePhase).toBe(0.33)
      expect(flame.renderSettings.paletteSpeed).toBe(2.0)
      expect(flame.renderSettings.densityEstimationQuality).toBe(4.0)
      expect(flame.renderSettings.estimatorCurve).toBe(0.6)
      expect(flame.renderSettings.drawMode).toBe('paint')
      expect(flame.renderSettings.colorInitMode).toBe('colorInitPosition')
      expect(flame.renderSettings.pointInitMode).toBe('pointInitRandom')
      expect(flame.renderSettings.backgroundColor).toEqual([0.1, 0.2, 0.3])
      expect(flame.renderSettings.edgeFadeColor).toEqual([0.4, 0.5, 0.6, 0.7])
    })

    it('applies transform and variation tracks correctly', () => {
      const flame = createMockFlame(2)
      const tracks: TimelineTrack[] = [
        {
          parameterPath: 'transform.t1.preAffine.a',
          keyframes: [{ frame: 0, value: 0.9 }],
        },
        {
          parameterPath: 'transform.t1.postAffine.d',
          keyframes: [{ frame: 0, value: 1.2 }],
        },
        {
          parameterPath: 'transform.t1.color.x',
          keyframes: [{ frame: 0, value: 0.75 }],
        },
        {
          parameterPath: 'transform.t1.probability',
          keyframes: [{ frame: 0, value: 0.6 }],
        },
        {
          parameterPath: 'transform.t1.colorSpeed',
          keyframes: [{ frame: 0, value: 0.4 }],
        },
        {
          parameterPath: 't1.linearT',
          keyframes: [{ frame: 0, value: 0.85 }],
        },
        {
          parameterPath: 't1.spherical.strength',
          keyframes: [{ frame: 0, value: 2.5 }],
        },
      ]

      applyTracksToFlame(tracks, flame, 0)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t1 = (flame.transforms as Record<string, any>)['t1']
      expect(t1.preAffine.a).toBe(0.9)
      expect(t1.postAffine.d).toBe(1.2)
      expect(t1.color.x).toBe(0.75)
      expect(t1.probability).toBe(0.6)
      expect(t1.colorSpeed).toBe(0.4)
      expect(t1.variations.linearT.weight).toBe(0.85)
      expect(t1.variations.spherical.params.strength).toBe(2.5)
    })

    it('seeds and applies 2D finalTransform tracks', () => {
      const flame = createMockFlame(2)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (flame as any).finalTransform
      const tracks: TimelineTrack[] = [
        {
          parameterPath: 'finalTransform.a',
          keyframes: [{ frame: 0, value: 1.1 }],
        },
        {
          parameterPath: 'finalTransform.b',
          keyframes: [{ frame: 0, value: 0.2 }],
        },
        {
          parameterPath: 'finalTransform.c',
          keyframes: [{ frame: 0, value: -0.2 }],
        },
        {
          parameterPath: 'finalTransform.d',
          keyframes: [{ frame: 0, value: 1.1 }],
        },
        {
          parameterPath: 'finalTransform.e',
          keyframes: [{ frame: 0, value: 0.5 }],
        },
        {
          parameterPath: 'finalTransform.f',
          keyframes: [{ frame: 0, value: -0.5 }],
        },
      ]

      applyTracksToFlame(tracks, flame, 0)

      expect(flame.finalTransform).toBeDefined()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ft = flame.finalTransform as any
      expect(ft.a).toBe(1.1)
      expect(ft.b).toBe(0.2)
      expect(ft.c).toBe(-0.2)
      expect(ft.d).toBe(1.1)
      expect(ft.e).toBe(0.5)
      expect(ft.f).toBe(-0.5)
    })

    it('seeds and applies 3D finalTransform tracks with 12-param identity', () => {
      const flame = createMockFlame(3)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (flame as any).finalTransform
      const tracks: TimelineTrack[] = [
        {
          parameterPath: 'finalTransform.a',
          keyframes: [{ frame: 0, value: 0.95 }],
        },
        {
          parameterPath: 'finalTransform.f',
          keyframes: [{ frame: 0, value: 1.05 }],
        },
      ]

      applyTracksToFlame(tracks, flame, 0)

      expect(flame.finalTransform).toBeDefined()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ft = flame.finalTransform as any
      expect(ft.a).toBe(0.95)
      expect(ft.f).toBe(1.05)
      // Verify 3D affine properties are retained from identity seeding
      expect(ft.k).toBe(1)
      expect(ft.l).toBe(0)
    })
  })
})

describe('resolveKeyframeValue segment ownership', () => {
  it("lets the segment's later keyframe own its interpolation mode", () => {
    // An audit mutation read the mode from the earlier keyframe instead and all
    // 86 tests here stayed green. Each case below differs under the two readings.
    const holdIntoNext = [
      { frame: 0, value: 0, interp: 'linear' as const },
      { frame: 10, value: 10, interp: 'constant' as const },
    ]
    expect(resolveKeyframeValue(holdIntoNext, 5)).toBe(0)

    const lerpIntoNext = [
      { frame: 0, value: 0, interp: 'constant' as const },
      { frame: 10, value: 10, interp: 'linear' as const },
    ]
    expect(resolveKeyframeValue(lerpIntoNext, 5)).toBe(5)
  })
})

/**
 * `loadRevision` is how the dope sheet learns that a whole animation arrived —
 * a file, a drop, a share link, the gallery, a tool — rather than a keyframe
 * being edited, so it can fit the new sequence into view. Editing must not
 * look like loading, or the viewer's zoom would be taken away on every change.
 */
describe('loadRevision', () => {
  it('counts whole-animation loads and ignores keyframe edits', () => {
    const timeline = createTimelineState()
    expect(timeline.loadRevision()).toBe(0)

    timeline.loadTracks([
      { parameterPath: 'camera.zoom', keyframes: [{ frame: 0, value: 1 }] },
    ])
    expect(timeline.loadRevision()).toBe(1)

    timeline.addKeyframe('camera.zoom', 30, 2)
    timeline.setKeyframeValue('camera.zoom', 30, 3)
    timeline.removeKeyframe('camera.zoom', 30)
    expect(timeline.loadRevision()).toBe(1)

    timeline.loadTracks([])
    expect(timeline.loadRevision()).toBe(2)
  })
})
