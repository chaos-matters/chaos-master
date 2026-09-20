import { describe, expect, it, vi } from 'vitest'
import { example1 } from '@/flame/examples/example1'
import { deepClone } from '@/utils/clone'
import { useWorkspaceTimelineBinding } from './useWorkspaceTimelineBinding'
import type { TimelineAccess } from './useWorkspaceTimelineBinding'
import type { TransformId, VariationId } from '@/flame/schema/flameSchema'

describe('useWorkspaceTimelineBinding', () => {
  function createMockTimeline(): TimelineAccess {
    return {
      isDrivingView: vi.fn(() => false),
      hasKeyframeAtFrame: vi.fn(() => false),
      currentFrame: vi.fn(() => 0),
      tracks: vi.fn(() => []),
      setValueResolver: vi.fn(),
      setValueWriter: vi.fn(),
    }
  }

  it('reads and writes render settings correctly', () => {
    const flame = deepClone(example1)
    const timeline = createMockTimeline()
    let silentlyCalled = false

    const history = {
      setSilently: (updater: (draft: typeof flame) => void) => {
        silentlyCalled = true
        updater(flame)
      },
    }

    const { getFlameValue, setFlameValue } = useWorkspaceTimelineBinding({
      flameDescriptor: flame,
      history,
      timeline,
      blendWeight: () => 0.75,
    })

    expect(getFlameValue('exposure')).toBe(flame.renderSettings.exposure)
    expect(getFlameValue('blendWeight')).toBe(0.75)
    expect(getFlameValue('camera.zoom')).toBe(flame.renderSettings.camera.zoom)

    setFlameValue('exposure', 1.85)
    expect(silentlyCalled).toBe(true)
    expect(flame.renderSettings.exposure).toBe(1.85)

    setFlameValue('blendWeight', 0.5)
    expect(flame.renderSettings.blendWeight).toBe(0.5)
  })

  it('reads and writes camera 3D settings', () => {
    const flame = deepClone(example1)
    const timeline = createMockTimeline()

    const history = {
      setSilently: (updater: (draft: typeof flame) => void) => {
        updater(flame)
      },
    }

    const { getFlameValue, setFlameValue } = useWorkspaceTimelineBinding({
      flameDescriptor: flame,
      history,
      timeline,
      blendWeight: () => 0,
    })

    setFlameValue('camera3D.theta', 1.2)
    setFlameValue('camera3D.phi', 0.8)
    expect(getFlameValue('camera3D.theta')).toBe(1.2)
    expect(getFlameValue('camera3D.phi')).toBe(0.8)
  })

  it('registers resolver and writer onto timeline', () => {
    const flame = deepClone(example1)
    const timeline = createMockTimeline()
    const history = { setSilently: vi.fn() }

    useWorkspaceTimelineBinding({
      flameDescriptor: flame,
      history,
      timeline,
      blendWeight: () => 0,
    })

    expect(timeline.setValueResolver).toHaveBeenCalled()
    expect(timeline.setValueWriter).toHaveBeenCalled()
  })

  it('reads and writes transform probability, color, and affine settings', () => {
    const flame = deepClone(example1)
    const firstTid = Object.keys(flame.transforms)[0] as TransformId
    const timeline = createMockTimeline()

    const history = {
      setSilently: (updater: (draft: typeof flame) => void) => {
        updater(flame)
      },
    }

    const { getFlameValue, setFlameValue } = useWorkspaceTimelineBinding({
      flameDescriptor: flame,
      history,
      timeline,
      blendWeight: () => 0,
    })

    // Read initial values
    expect(getFlameValue(`transform.${firstTid}.probability`)).toBe(0.4)
    expect(getFlameValue(`transform.${firstTid}.color.x`)).toBe(0.1)
    expect(getFlameValue(`transform.${firstTid}.preAffine.a`)).toBe(0.8)

    // Write new values
    setFlameValue(`transform.${firstTid}.probability`, 0.9)
    setFlameValue(`transform.${firstTid}.color.x`, 0.75)
    setFlameValue(`transform.${firstTid}.preAffine.a`, 0.25)

    expect(getFlameValue(`transform.${firstTid}.probability`)).toBe(0.9)
    expect(getFlameValue(`transform.${firstTid}.color.x`)).toBe(0.75)
    expect(getFlameValue(`transform.${firstTid}.preAffine.a`)).toBe(0.25)
  })

  it('reads and writes variation weights and parameters', () => {
    const flame = deepClone(example1)
    const firstTid = Object.keys(flame.transforms)[0] as TransformId
    const firstVid = Object.keys(
      flame.transforms[firstTid]!.variations,
    )[0] as VariationId
    const timeline = createMockTimeline()

    const history = {
      setSilently: (updater: (draft: typeof flame) => void) => {
        updater(flame)
      },
    }

    const { getFlameValue, setFlameValue } = useWorkspaceTimelineBinding({
      flameDescriptor: flame,
      history,
      timeline,
      blendWeight: () => 0,
    })

    // Variation weight
    expect(getFlameValue(`${firstTid}.${firstVid}`)).toBe(1)
    setFlameValue(`${firstTid}.${firstVid}`, 0.42)
    expect(getFlameValue(`${firstTid}.${firstVid}`)).toBe(0.42)
    expect(flame.transforms[firstTid]!.variations[firstVid]!.weight).toBe(0.42)
  })

  it('falls back to a level orbit (phi = pi/2) for a flame without a 3D camera', () => {
    // phi = 0 would put the camera at the pole looking straight down; the
    // fallback has to be the equator. An audit mutation set it to 0 and every
    // test in this file stayed green.
    const flame = deepClone(example1)
    delete (flame.renderSettings as { camera3D?: unknown }).camera3D
    const { getFlameValue } = useWorkspaceTimelineBinding({
      flameDescriptor: flame,
      history: { setSilently: () => {} },
      timeline: createMockTimeline(),
      blendWeight: () => 0,
    })
    expect(getFlameValue('camera3D.phi')).toBe(Math.PI / 2)
  })

  /**
   * A timeline whose playhead sits on a keyframe for `path` while it drives the
   * view. The existing mock pins both of those to false, which is why the
   * keyframe short-circuit could widen to every path without a test failing.
   */
  function timelineWithKeyframe(path: string, value: number): TimelineAccess {
    return {
      ...createMockTimeline(),
      isDrivingView: vi.fn(() => true),
      currentFrame: vi.fn(() => 30),
      hasKeyframeAtFrame: vi.fn(
        (p: string, f: number) => p === path && f === 30,
      ),
      tracks: vi.fn(() => [
        {
          parameterPath: path,
          keyframes: [{ frame: 30, value, easing: 'linear' as const }],
        },
      ]),
    }
  }

  function bind(flame: typeof example1, timeline: TimelineAccess) {
    return useWorkspaceTimelineBinding({
      flameDescriptor: flame,
      history: {
        setSilently: (updater: (draft: typeof flame) => void) => {
          updater(flame)
        },
      },
      timeline,
      blendWeight: () => 0,
    })
  }

  it('does not let a transform keyframe shadow a live edit to that transform', () => {
    const flame = deepClone(example1)
    const tid = Object.keys(flame.transforms)[0] as TransformId
    const path = `transform.${tid}.probability`
    const { getFlameValue, setFlameValue } = bind(
      flame,
      timelineWithKeyframe(path, 0.4),
    )

    setFlameValue(path, 0.9)

    // The playhead sits on a keyframe for this path, but the user just moved
    // the slider. The live edit wins; only camera paths short-circuit.
    expect(getFlameValue(path)).toBe(0.9)
  })

  it('does not let a variation-weight keyframe shadow a live edit', () => {
    const flame = deepClone(example1)
    const tid = Object.keys(flame.transforms)[0] as TransformId
    const vid = Object.keys(flame.transforms[tid]!.variations)[0] as VariationId
    const path = `${tid}.${vid}`
    const { getFlameValue, setFlameValue } = bind(
      flame,
      timelineWithKeyframe(path, 0.1),
    )

    setFlameValue(path, 0.42)

    expect(getFlameValue(path)).toBe(0.42)
  })

  it.each([
    'camera.x',
    'camera.y',
    'camera.zoom',
    'camera3D.theta',
    'camera3D.phi',
    'camera3D.radius',
    'camera3D.fov',
  ])(
    'still short-circuits %s to the keyframe while the timeline drives the view',
    (path) => {
      const flame = deepClone(example1)
      const { getFlameValue } = bind(flame, timelineWithKeyframe(path, 2.5))

      expect(getFlameValue(path)).toBe(2.5)
    },
  )

  it('never short-circuits camera.rotation, which had no short-circuit before the extraction', () => {
    const flame = deepClone(example1)
    const { getFlameValue, setFlameValue } = bind(
      flame,
      timelineWithKeyframe('camera.rotation', 1.23),
    )

    setFlameValue('camera.rotation', 0.5)

    expect(getFlameValue('camera.rotation')).toBe(0.5)
  })
})
