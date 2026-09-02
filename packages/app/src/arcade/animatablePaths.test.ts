import { describe, expect, it } from 'vitest'
import { createTestFlame } from '@/webmcp/testUtils'
import { buildAnimatableCatalog, buildTimelineSnapshot, } from './animatablePaths'

describe('animatable catalog', () => {
  const flame = createTestFlame()
  const catalog = buildAnimatableCatalog(flame)
  const paths = catalog.map((e) => e.path)

  it('lists render, camera, transform, variation and final paths with current values', () => {
    expect(paths).toContain('exposure')
    expect(paths).toContain('camera.zoom')
    expect(paths).toContain('transform.t1.preAffine.a')
    expect(paths).toContain('transform.t2.probability')
    expect(paths).toContain('t2.v2')
    expect(paths).toContain('finalTransform.a')
    expect(new Set(paths).size).toBe(paths.length)
    expect(catalog.find((e) => e.path === 'exposure')?.current).toBe(0.25)
    expect(catalog.find((e) => e.path === 't2.v2')?.current).toBe(0.7)
  })

  it('builds a valid timeline snapshot from good input', () => {
    const built = buildTimelineSnapshot(
      {
        fps: 30,
        durationFrames: 120,
        loopMode: 'seamless',
        tracks: [
          {
            path: 'camera.zoom',
            keyframes: [
              { frame: 0, value: 1, easing: 'easeInOut' },
              { frame: 120, value: 2 },
            ],
          },
          {
            path: 't2.v2',
            keyframes: [
              { frame: 0, value: 0.7 },
              { frame: 60, value: 1.2, interp: 'spline' },
            ],
          },
        ],
      },
      catalog,
    )
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.keyframeCount).toBe(4)
    expect(built.snapshot.config).toMatchObject({
      fps: 30,
      endFrame: 120,
      loopMode: 'seamless',
      loop: true,
    })
    expect(built.snapshot.tracks[0]).toMatchObject({
      parameterPath: 'camera.zoom',
    })
    expect(built.snapshot.tracks[0]?.keyframes[1]).toMatchObject({
      frame: 120,
      easing: 'linear',
      interp: 'linear',
    })
  })

  it('rejects unknown paths, frames past the end, wrong value types and duplicates', () => {
    const base = { durationFrames: 60 }
    expect(
      buildTimelineSnapshot(
        {
          ...base,
          tracks: [{ path: 'nope', keyframes: [{ frame: 0, value: 1 }] }],
        },
        catalog,
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('Unknown path'),
    })
    expect(
      buildTimelineSnapshot(
        {
          ...base,
          tracks: [{ path: 'exposure', keyframes: [{ frame: 61, value: 1 }] }],
        },
        catalog,
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('past durationFrames'),
    })
    expect(
      buildTimelineSnapshot(
        {
          ...base,
          tracks: [{ path: 'exposure', keyframes: [{ frame: 0, value: 'x' }] }],
        },
        catalog,
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('expects a number'),
    })
    expect(
      buildTimelineSnapshot(
        {
          ...base,
          tracks: [
            { path: 'exposure', keyframes: [{ frame: 0, value: 1 }] },
            { path: 'exposure', keyframes: [{ frame: 0, value: 2 }] },
          ],
        },
        catalog,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('twice') })
    expect(
      buildTimelineSnapshot(
        {
          ...base,
          tracks: [
            {
              path: 'exposure',
              keyframes: [
                { frame: 10, value: 1 },
                { frame: 10, value: 2 },
              ],
            },
          ],
        },
        catalog,
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('increasing') })
  })
})
