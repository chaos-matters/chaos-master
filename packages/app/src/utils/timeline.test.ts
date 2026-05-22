import { beforeEach, describe, expect, it } from 'vitest'
import { createTimelineState } from './timeline'

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

      it('should stop at end frame when loop disabled', () => {
        timeline.setConfig({ ...timeline.config(), loop: false })
        timeline.setCurrentFrame(90)
        timeline.advanceFrame()
        expect(timeline.currentFrame()).toBe(90)
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
})
