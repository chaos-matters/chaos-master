import { describe, expect, it } from 'vitest'
import { autoPlayComplete, createPlaybackCoordinator, frameAtElapsed, loopFrameCount, PLAYBACK_FPS, } from './homePlayback'

describe('loopFrameCount', () => {
  it('counts both endpoints — 0..endFrame is inclusive', () => {
    expect(loopFrameCount(90)).toBe(91)
    expect(loopFrameCount(0)).toBe(1)
  })

  it('never returns zero, so the frame maths cannot divide by it', () => {
    expect(loopFrameCount(-5)).toBe(1)
  })
})

describe('frameAtElapsed', () => {
  it('starts on the frame it was given', () => {
    expect(frameAtElapsed(30, 90, 0)).toBe(30)
  })

  it('advances at the playback rate', () => {
    expect(frameAtElapsed(0, 90, 1000, PLAYBACK_FPS)).toBe(30)
    expect(frameAtElapsed(0, 90, 500, PLAYBACK_FPS)).toBe(15)
  })

  it('quantises to whole frames, so a 120Hz tick does not re-pose twice', () => {
    const eighthOfAFrame = 1000 / PLAYBACK_FPS / 8
    expect(frameAtElapsed(0, 90, eighthOfAFrame)).toBe(0)
    expect(frameAtElapsed(0, 90, eighthOfAFrame * 7)).toBe(0)
  })

  it('wraps at the end of the timeline', () => {
    // 91 frames in the loop, so 91 frames on from 0 is 0 again.
    expect(frameAtElapsed(0, 90, (91 * 1000) / PLAYBACK_FPS)).toBe(0)
    expect(frameAtElapsed(80, 90, (20 * 1000) / PLAYBACK_FPS)).toBe(9)
  })

  it('lands back exactly on the starting frame after one loop', () => {
    for (const start of [0, 7, 45, 90]) {
      const loopMs = (loopFrameCount(90) * 1000) / PLAYBACK_FPS
      expect(frameAtElapsed(start, 90, loopMs)).toBe(start)
    }
  })

  it('tolerates a start frame outside the timeline', () => {
    expect(frameAtElapsed(95, 90, 0)).toBe(4)
    expect(frameAtElapsed(-1, 90, 0)).toBe(90)
  })

  it('treats a negative elapsed time as the start of the run', () => {
    expect(frameAtElapsed(12, 90, -100)).toBe(12)
  })
})

describe('autoPlayComplete', () => {
  it('is false before one loop has played', () => {
    expect(autoPlayComplete(0, 90)).toBe(false)
    expect(autoPlayComplete(2000, 90)).toBe(false)
  })

  it('is true at exactly one loop', () => {
    const loopMs = (loopFrameCount(90) * 1000) / PLAYBACK_FPS
    expect(autoPlayComplete(loopMs, 90)).toBe(true)
  })

  it('caps a long timeline at the time budget instead of a whole loop', () => {
    // 1200 frames at 30fps is 40s — far past "brief".
    expect(autoPlayComplete(6000, 1200)).toBe(true)
    expect(autoPlayComplete(5999, 1200)).toBe(false)
  })

  it('completes immediately for a still (no keyframes)', () => {
    expect(autoPlayComplete(1000 / PLAYBACK_FPS, 0)).toBe(true)
  })
})

describe('createPlaybackCoordinator', () => {
  const plate = (name: string) => Symbol(name)

  it('grants up to the capacity and no further', () => {
    const coordinator = createPlaybackCoordinator(2)
    const a = plate('a')
    const b = plate('b')
    const c = plate('c')
    coordinator.request(a, 'auto')
    coordinator.request(b, 'auto')
    coordinator.request(c, 'auto')
    expect(coordinator.activeCount()).toBe(2)
    expect(coordinator.isGranted(a)).toBe(true)
    expect(coordinator.isGranted(b)).toBe(true)
    expect(coordinator.isGranted(c)).toBe(false)
  })

  it('promotes a waiting plate when a slot is released', () => {
    const coordinator = createPlaybackCoordinator(2)
    const a = plate('a')
    const b = plate('b')
    const c = plate('c')
    coordinator.request(a, 'auto')
    coordinator.request(b, 'auto')
    coordinator.request(c, 'auto')
    coordinator.release(a)
    expect(coordinator.isGranted(c)).toBe(true)
    expect(coordinator.activeCount()).toBe(2)
  })

  it('lets a hover preempt a running auto-play', () => {
    const coordinator = createPlaybackCoordinator(2)
    const a = plate('a')
    const b = plate('b')
    const hovered = plate('hovered')
    coordinator.request(a, 'auto')
    coordinator.request(b, 'auto')
    coordinator.request(hovered, 'hover')
    expect(coordinator.isGranted(hovered)).toBe(true)
    expect(coordinator.activeCount()).toBe(2)
    // The later auto-play is the one that loses its slot: incumbency only
    // breaks ties within the same reason.
    expect(coordinator.isGranted(a)).toBe(true)
    expect(coordinator.isGranted(b)).toBe(false)
  })

  it('keeps an incumbent playing when a new plate asks for the same reason', () => {
    const coordinator = createPlaybackCoordinator(1)
    const running = plate('running')
    const arriving = plate('arriving')
    coordinator.request(running, 'auto')
    coordinator.request(arriving, 'auto')
    expect(coordinator.isGranted(running)).toBe(true)
    expect(coordinator.isGranted(arriving)).toBe(false)
  })

  it('upgrades a plate from auto to hover without re-queueing it', () => {
    const coordinator = createPlaybackCoordinator(1)
    const first = plate('first')
    const second = plate('second')
    coordinator.request(first, 'auto')
    coordinator.request(second, 'auto')
    coordinator.request(second, 'hover')
    expect(coordinator.isGranted(second)).toBe(true)
    expect(coordinator.isGranted(first)).toBe(false)
    // Dropping back to auto does NOT hand the slot back: incumbency outranks
    // arrival order within a reason, so the plate that is already animating
    // finishes its loop rather than cutting to a different one.
    coordinator.request(second, 'auto')
    expect(coordinator.isGranted(second)).toBe(true)
    expect(coordinator.isGranted(first)).toBe(false)
  })

  it('ignores a release for a plate that never asked', () => {
    const coordinator = createPlaybackCoordinator(2)
    const a = plate('a')
    coordinator.request(a, 'auto')
    coordinator.release(plate('stranger'))
    expect(coordinator.isGranted(a)).toBe(true)
    expect(coordinator.activeCount()).toBe(1)
  })

  it('grants nothing at zero capacity', () => {
    const coordinator = createPlaybackCoordinator(0)
    const a = plate('a')
    coordinator.request(a, 'hover')
    expect(coordinator.isGranted(a)).toBe(false)
    expect(coordinator.activeCount()).toBe(0)
  })
})
