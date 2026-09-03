import { describe, expect, it } from 'vitest'
import { createTestFlame } from '@/webmcp/testUtils'
import { buildAnimatableCatalog, buildTimelineSnapshot, } from './animatablePaths'
import type { TimelineTrack } from '@/utils/timeline'

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
      // Never on for an agent take: the GPU would run the animation for as
      // long as the agent thinks about its next call.
      loop: false,
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

  it('merges with the tracks already placed when mode is "add"', () => {
    const existing: TimelineTrack[] = [
      {
        parameterPath: 'exposure',
        keyframes: [
          { frame: 0, value: 0.25, easing: 'linear', interp: 'linear' },
          { frame: 60, value: 0.5, easing: 'linear', interp: 'linear' },
        ],
      },
      {
        parameterPath: 'camera.zoom',
        keyframes: [{ frame: 0, value: 1, easing: 'linear', interp: 'linear' }],
      },
    ]
    const built = buildTimelineSnapshot(
      {
        durationFrames: 60,
        mode: 'add',
        tracks: [
          {
            path: 'camera.zoom',
            keyframes: [
              { frame: 0, value: 1 },
              { frame: 60, value: 3 },
            ],
          },
          { path: 't2.v2', keyframes: [{ frame: 30, value: 0.9 }] },
        ],
      },
      catalog,
      existing,
    )
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.snapshot.tracks.map((t) => t.parameterPath)).toEqual([
      'exposure',
      'camera.zoom',
      't2.v2',
    ])
    // The path sent this time wins, so a second pass is a correction rather
    // than a duplicate track.
    expect(built.snapshot.tracks[1]?.keyframes).toHaveLength(2)
    expect(built.keyframeCount).toBe(5)
  })

  it('replaces everything when mode is left out', () => {
    const built = buildTimelineSnapshot(
      {
        durationFrames: 60,
        tracks: [{ path: 't2.v2', keyframes: [{ frame: 0, value: 0.7 }] }],
      },
      catalog,
      [
        {
          parameterPath: 'exposure',
          keyframes: [
            { frame: 0, value: 0.25, easing: 'linear', interp: 'linear' },
          ],
        },
      ] satisfies TimelineTrack[],
    )
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.snapshot.tracks.map((t) => t.parameterPath)).toEqual(['t2.v2'])
  })

  it('refuses to cut an existing track short when adding', () => {
    expect(
      buildTimelineSnapshot(
        {
          durationFrames: 30,
          mode: 'add',
          tracks: [{ path: 't2.v2', keyframes: [{ frame: 0, value: 0.7 }] }],
        },
        catalog,
        [
          {
            parameterPath: 'exposure',
            keyframes: [
              { frame: 0, value: 0.25, easing: 'linear', interp: 'linear' },
              { frame: 90, value: 0.5, easing: 'linear', interp: 'linear' },
            ],
          },
        ] satisfies TimelineTrack[],
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('would cut the existing track'),
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
