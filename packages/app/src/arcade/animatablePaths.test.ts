import { describe, expect, it } from 'vitest'
import { createTestFlame } from '@/webmcp/testUtils'
import { buildAnimatableCatalog, buildTimelineSnapshot, } from './animatablePaths'
import type { TimelineTrack } from '@/utils/timeline'

/**
 * A flame renders through exactly one pipeline, and the two take different
 * cameras: `createIFSPipeline3D` never sees the 2D camera and
 * `createIFSPipeline` never sees `camera3D` (Flam3.tsx). Offering an agent the
 * family that is not wired up hands it four controls that resolve correctly on
 * the timeline and move nothing on screen — which is exactly what happened to
 * a Cinema take on a 3D flame: it checked its own work by reading the values
 * back, and they were right.
 */
describe('only the camera that renders is animatable', () => {
  function flameIn(dimensions: 2 | 3) {
    const flame = createTestFlame()
    flame.renderSettings.dimensions = dimensions
    return flame
  }

  it('offers a 3D flame the 3D camera and hides the 2D one', () => {
    const paths = buildAnimatableCatalog(flameIn(3)).map((e) => e.path)
    expect(paths).toContain('camera3D.radius')
    expect(paths).toContain('camera3D.theta')
    expect(paths.filter((p) => p.startsWith('camera.'))).toEqual([])
  })

  it('offers a 2D flame the 2D camera and hides the 3D one', () => {
    const paths = buildAnimatableCatalog(flameIn(2)).map((e) => e.path)
    expect(paths).toContain('camera.zoom')
    expect(paths.filter((p) => p.startsWith('camera3D.'))).toEqual([])
  })

  it('says which camera to use instead of calling the path unknown', () => {
    const flame = flameIn(3)
    const result = buildTimelineSnapshot(
      {
        fps: 30,
        durationFrames: 60,
        tracks: [
          {
            path: 'camera.zoom',
            keyframes: [
              { frame: 0, value: 1 },
              { frame: 59, value: 1.75 },
            ],
          },
        ],
      },
      buildAnimatableCatalog(flame),
      [],
    )
    expect(result.ok).toBe(false)
    const error = result.ok ? '' : result.error
    // "Unknown path" would be a lie — it exists, it just is not wired up here.
    expect(error).not.toContain('Unknown path')
    expect(error).toContain('2D camera')
    expect(error).toContain('camera3D.radius')
    // The unit question the agent could not answer from the tool alone.
    expect(error).toContain('radians')
  })

  it('says the same thing the other way round', () => {
    const result = buildTimelineSnapshot(
      {
        fps: 30,
        durationFrames: 60,
        tracks: [
          {
            path: 'camera3D.radius',
            keyframes: [
              { frame: 0, value: 3 },
              { frame: 59, value: 2 },
            ],
          },
        ],
      },
      buildAnimatableCatalog(flameIn(2)),
      [],
    )
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.error).toContain('camera.zoom')
  })
})

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

  /** The agent that met this refusal on a preset's 90-frame orbit guessed the
   *  keyframes were malformed and spent a step clearing the timeline. All
   *  three ways out are in the sentence now, including the one it took. */
  it('names every way past a preset animation it would cut', () => {
    const built = buildTimelineSnapshot(
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
            { frame: 0, value: 0.25 },
            { frame: 90, value: 0.5 },
          ],
        },
      ] satisfies TimelineTrack[],
    )
    expect(built.ok).toBe(false)
    if (built.ok) return
    expect(built.error).toContain('durationFrames 90 or more')
    expect(built.error).toContain('mode "replace"')
    expect(built.error).toContain('timeline.clearTracks')
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

  // Variation paths are the one form that takes no `transform.` prefix, so
  // agents reach for the prefixed one and lose a call to the rejection. It is
  // accepted and stored canonically, which is what keeps a later call on the
  // same target overwriting the same track instead of making a second one.
  it('accepts a transform-prefixed variation path and stores the canonical one', () => {
    const result = buildTimelineSnapshot(
      {
        durationFrames: 60,
        tracks: [
          {
            path: 'transform.t2.v2',
            keyframes: [
              { frame: 0, value: 0.5 },
              { frame: 60, value: 0.9 },
            ],
          },
        ],
      },
      catalog,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.tracks.map((track) => track.parameterPath)).toEqual([
      't2.v2',
    ])
  })

  it('still refuses a prefixed path that names nothing', () => {
    expect(
      buildTimelineSnapshot(
        {
          durationFrames: 60,
          tracks: [
            { path: 'transform.t2.nope', keyframes: [{ frame: 0, value: 1 }] },
          ],
        },
        catalog,
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('Unknown path'),
    })
  })
})
