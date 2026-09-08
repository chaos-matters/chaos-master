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
})
