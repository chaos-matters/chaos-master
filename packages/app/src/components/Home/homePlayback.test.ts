import { describe, expect, it } from 'vitest'
import { autoPlayComplete, createPlaybackCoordinator, frameAtElapsed, loopCompletesAtMs, loopFrameCount, nextPortalPlayback, PLAYBACK_FPS, PORTAL_PLAY_RATIO, SEQUENCE_STEP_MS, sequenceIndexAt, sequenceLoopMs, stepFromFraction, timelineLoopMs, visibleFraction, } from './homePlayback'
import type { PortalPlayback } from './homePlayback'

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

describe('loopCompletesAtMs', () => {
  // The rule behind "the pointer left, so play out the rest of the loop": a run
  // that ends on the frame it started from lands on the poster's own image, so
  // there is nothing to cut between.
  const loop = timelineLoopMs(89) // 90 frames at 30fps = 3000ms

  it('has nothing left to play at a loop boundary', () => {
    expect(loopCompletesAtMs(0, loop)).toBe(0)
    expect(loopCompletesAtMs(loop, loop)).toBe(loop)
    expect(loopCompletesAtMs(loop * 3, loop)).toBe(loop * 3)
  })

  it('finishes the loop it is in, not a whole extra one', () => {
    expect(loopCompletesAtMs(10, loop)).toBe(loop)
    expect(loopCompletesAtMs(loop - 1, loop)).toBe(loop)
    expect(loopCompletesAtMs(loop + 1, loop)).toBe(loop * 2)
  })

  it('never asks a still to wait for a loop it does not have', () => {
    expect(loopCompletesAtMs(500, 0)).toBe(0)
    expect(loopCompletesAtMs(500, -1)).toBe(0)
  })
})

describe('sequence walking', () => {
  // A row with a curated `sequence` walks `[flame, ...sequence]`. Index 0 is
  // the row's own flame, which is what the poster was captured from.
  it('holds each flame for one step and wraps', () => {
    expect(sequenceIndexAt(0, 4)).toBe(0)
    expect(sequenceIndexAt(SEQUENCE_STEP_MS - 1, 4)).toBe(0)
    expect(sequenceIndexAt(SEQUENCE_STEP_MS, 4)).toBe(1)
    expect(sequenceIndexAt(SEQUENCE_STEP_MS * 3, 4)).toBe(3)
    // Back to the row's own flame, which is where a run must end.
    expect(sequenceIndexAt(SEQUENCE_STEP_MS * 4, 4)).toBe(0)
  })

  it('walks two curated paths as one flat list', () => {
    // The reason the column is an array and not a nested shape: a row holding
    // two paths is simply longer, and nothing here knows where one ends.
    const twoPaths = 8
    expect(sequenceLoopMs(twoPaths)).toBe(SEQUENCE_STEP_MS * 8)
    expect(sequenceIndexAt(SEQUENCE_STEP_MS * 4, twoPaths)).toBe(4)
    expect(sequenceIndexAt(SEQUENCE_STEP_MS * 7, twoPaths)).toBe(7)
    expect(sequenceIndexAt(SEQUENCE_STEP_MS * 8, twoPaths)).toBe(0)
  })

  it('rests on the row for a walk of one — the no-sequence fallback', () => {
    // Every row but one has no `sequence`, so its walk is [flame] and the
    // index can only ever be 0. That is the fallback path, and it is the same
    // code rather than a branch around it.
    for (const elapsed of [0, 500, 10_000]) {
      expect(sequenceIndexAt(elapsed, 1)).toBe(0)
    }
    expect(sequenceIndexAt(0, 0)).toBe(0)
  })

  it('treats a negative clock as the start of the walk', () => {
    expect(sequenceIndexAt(-500, 4)).toBe(0)
  })
})

describe('visibleFraction', () => {
  it('reports the fraction of a normal element that is showing', () => {
    expect(visibleFraction(400, 900, 400)).toBe(1)
    expect(visibleFraction(400, 900, 200)).toBe(0.5)
    expect(visibleFraction(400, 900, 0)).toBe(0)
  })

  it('measures a taller-than-viewport element against the viewport', () => {
    // The failure this exists to prevent: an element taller than the root can
    // never reach an 80% intersectionRatio, so the portal would never play on
    // a short window.
    expect(visibleFraction(2000, 800, 800)).toBe(1)
    expect(visibleFraction(2000, 800, 640)).toBeCloseTo(0.8, 5)
  })

  it('survives a root it was never told about', () => {
    // `rootBounds` is null in some cross-origin cases; falling back to the
    // target keeps the measure meaningful instead of dividing by zero.
    expect(visibleFraction(400, 0, 200)).toBe(0.5)
    expect(visibleFraction(0, 0, 0)).toBe(0)
  })
})

describe('nextPortalPlayback', () => {
  // The whole complaint this answers: "restarting on every small scroll is
  // actually annoying".
  const play = (from: PortalPlayback, fraction: number) =>
    nextPortalPlayback(from, fraction)

  it('does not start until the portal substantially fills the screen', () => {
    expect(play('idle', 0.1)).toBe('idle')
    expect(play('idle', PORTAL_PLAY_RATIO - 0.01)).toBe('idle')
    expect(play('idle', PORTAL_PLAY_RATIO)).toBe('playing')
  })

  it('ignores every scroll that keeps it above the threshold', () => {
    // The nudges the user was complaining about: nothing changes, so nothing
    // downstream restarts.
    expect(play('playing', 1)).toBe('playing')
    expect(play('playing', 0.95)).toBe('playing')
    expect(play('playing', PORTAL_PLAY_RATIO)).toBe('playing')
  })

  it('stops and holds below the threshold, without resetting', () => {
    expect(play('playing', 0.5)).toBe('held')
    expect(play('held', 0.5)).toBe('held')
    // And picks straight back up on the way in.
    expect(play('held', 0.9)).toBe('playing')
  })

  it('resets only when it is gone completely', () => {
    expect(play('playing', 0)).toBe('idle')
    expect(play('held', 0)).toBe('idle')
    expect(play('held', -0)).toBe('idle')
  })

  it('never begins a build off-screen', () => {
    // From idle, a partial view stays idle: scrolling the section up from below
    // must not start the script before anyone can see it.
    expect(play('idle', 0.79)).toBe('idle')
    expect(play('idle', 0.01)).toBe('idle')
  })

  it('walks a whole scroll past the section without a second start', () => {
    const seen: PortalPlayback[] = []
    let state: PortalPlayback = 'idle'
    // Approach, arrive, jitter around the threshold, leave, come back.
    for (const fraction of [
      0, 0.3, 0.85, 1, 0.99, 0.82, 0.9, 0.6, 0.75, 0.95, 0, 0.9,
    ]) {
      state = nextPortalPlayback(state, fraction)
      seen.push(state)
    }
    expect(seen).toEqual([
      'idle',
      'idle',
      'playing',
      'playing',
      'playing',
      'playing',
      'playing',
      'held',
      'held',
      'playing',
      'idle',
      'playing',
    ])
  })
})

describe('stepFromFraction', () => {
  it('maps the ends of the track to the ends of the script', () => {
    expect(stepFromFraction(0, 24)).toBe(0)
    expect(stepFromFraction(1, 24)).toBe(23)
  })

  it('rounds to the nearest step, so both ends are reachable', () => {
    expect(stepFromFraction(0.5, 5)).toBe(2)
    expect(stepFromFraction(0.24, 5)).toBe(1)
  })

  it('clamps a drag that left the track', () => {
    expect(stepFromFraction(-2, 10)).toBe(0)
    expect(stepFromFraction(4, 10)).toBe(9)
  })

  it('has nowhere to go in a one-step or empty script', () => {
    expect(stepFromFraction(0.7, 1)).toBe(0)
    expect(stepFromFraction(0.7, 0)).toBe(0)
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

  it('ranks a run playing itself out above one that has not started', () => {
    // A plate finishing its loop is the only thing on screen actually moving;
    // an auto-play plate that has not begun has nothing to interrupt.
    const coordinator = createPlaybackCoordinator(1)
    const arriving = plate('arriving')
    const finishing = plate('finishing')
    coordinator.request(arriving, 'auto')
    coordinator.request(finishing, 'finishing')
    expect(coordinator.isGranted(finishing)).toBe(true)
    expect(coordinator.isGranted(arriving)).toBe(false)
  })

  it('still lets a pointer outrank a plate playing itself out', () => {
    const coordinator = createPlaybackCoordinator(1)
    const finishing = plate('finishing')
    const hovered = plate('hovered')
    coordinator.request(finishing, 'finishing')
    coordinator.request(hovered, 'hover')
    expect(coordinator.isGranted(hovered)).toBe(true)
    expect(coordinator.isGranted(finishing)).toBe(false)
  })

  describe('pointerActive', () => {
    // The cross-talk fix: with auto-play retired as soon as a pointer lands
    // anywhere, hovering one plate can never be the reason a DIFFERENT plate
    // stops mid-loop.
    it('is false while only auto-play is asking', () => {
      const coordinator = createPlaybackCoordinator(2)
      coordinator.request(plate('a'), 'auto')
      coordinator.request(plate('b'), 'finishing')
      expect(coordinator.pointerActive()).toBe(false)
    })

    it('is true from the moment any plate asks for a hover slot', () => {
      const coordinator = createPlaybackCoordinator(2)
      const a = plate('a')
      const b = plate('b')
      const c = plate('c')
      coordinator.request(a, 'auto')
      coordinator.request(b, 'auto')
      // Even though the page is full and this plate gets nothing, the POINTER
      // is what matters: a request that loses is still the user taking over.
      coordinator.request(c, 'hover')
      expect(coordinator.isGranted(c)).toBe(true)
      expect(coordinator.pointerActive()).toBe(true)
    })

    it('clears when the pointer leaves, however the plate lets go', () => {
      const coordinator = createPlaybackCoordinator(2)
      const released = plate('released')
      const downgraded = plate('downgraded')
      coordinator.request(released, 'hover')
      coordinator.request(downgraded, 'hover')
      expect(coordinator.pointerActive()).toBe(true)
      coordinator.release(released)
      expect(coordinator.pointerActive()).toBe(true)
      // A plate whose pointer left goes on playing out its loop; that must not
      // read as a pointer still being on the page.
      coordinator.request(downgraded, 'finishing')
      expect(coordinator.pointerActive()).toBe(false)
    })

    it('counts a plate once however often it re-asks', () => {
      const coordinator = createPlaybackCoordinator(2)
      const a = plate('a')
      coordinator.request(a, 'hover')
      coordinator.request(a, 'hover')
      coordinator.request(a, 'hover')
      coordinator.release(a)
      expect(coordinator.pointerActive()).toBe(false)
    })
  })
})
