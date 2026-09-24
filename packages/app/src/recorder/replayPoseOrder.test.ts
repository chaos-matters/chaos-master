/**
 * The replay pose writes each track twice: the generic first-level write for
 * bare render-setting paths, and `applyTracksToFlame`. They used to run in the
 * other order, generic last; now `applyTracksToFlame` runs last so its schema
 * projection covers both. The order cannot change a value, because both
 * resolve the same keyframes at the same frame with the same loop options,
 * `loopOptsFromConfig(timeline.config, timeline.tracks)`: where both write a
 * path they write the same value, and where only one writes, order is moot.
 *
 * This holds the pose to the old order followed by the projection, over every
 * bundled animation at every keyframe and midpoint, in each loop mode.
 */
import { projectFlameToSchema } from '@chaos-master/core'
import { describe, expect, it } from 'vitest'
import { animationDefs, getAnimationFlame } from '@/flame/examples/animations'
import { deepClone } from '@/utils/clone'
import { applyTracksToFlame, defaultConfig, getUserEndFrame, loopOptsFromConfig, resolveLoopValue, } from '@/utils/timeline'
import { createReplayVideoDriver } from './replayVideo'
import { SESSION_FORMAT_VERSION } from './schema'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { LoopMode, TimelineConfig, TimelineTrack } from '@/utils/timeline'

/** The pose as it was before the reorder, then projected. */
function oldOrderProjected(
  base: FlameDescriptor,
  tracks: TimelineTrack[],
  config: TimelineConfig,
  frame: number,
): FlameDescriptor {
  const posed = deepClone(base)
  const loop = loopOptsFromConfig(config, tracks)
  applyTracksToFlame(tracks, posed, frame, loop)
  for (const track of tracks) {
    if (track.parameterPath.includes('.')) continue
    const value = resolveLoopValue(track.keyframes, frame, loop)
    if (
      value !== null &&
      (track.parameterPath === 'blendWeight' ||
        track.parameterPath in posed.renderSettings)
    ) {
      ;(posed.renderSettings as unknown as Record<string, unknown>)[
        track.parameterPath
      ] = deepClone(value)
    }
  }
  return projectFlameToSchema(posed)
}

function replayPose(
  base: FlameDescriptor,
  tracks: TimelineTrack[],
  config: TimelineConfig,
  frame: number,
): FlameDescriptor {
  const driver = createReplayVideoDriver({
    version: SESSION_FORMAT_VERSION,
    app: { version: 'test', flameSchemaVersion: '1.0' },
    createdAt: new Date(0).toISOString(),
    initial: deepClone(base),
    actions: [],
    unnamedWriteCount: 0,
    initialTimeline: {
      config,
      currentFrame: frame,
      animationEnabled: true,
      autoKeyframe: false,
      previewHeld: true,
      tracks: deepClone(tracks),
    },
  })
  return driver.reset().flame
}

const LOOP_MODES: readonly LoopMode[] = ['off', 'seamless', 'cycle']

describe('replay pose order', () => {
  it('matches the old order, projected, on every bundled animation', () => {
    const mismatches: string[] = []
    let compared = 0
    for (const anim of animationDefs) {
      const base = getAnimationFlame(anim)
      const keyed = [
        ...new Set(anim.tracks.flatMap((t) => t.keyframes.map((k) => k.frame))),
      ].sort((a, b) => a - b)
      const frames = [
        ...keyed,
        ...keyed.slice(1).map((f, i) => Math.floor((f + keyed[i]!) / 2)),
      ]
      for (const loopMode of LOOP_MODES) {
        const config = {
          ...defaultConfig(),
          endFrame: Math.max(1, getUserEndFrame(anim.tracks, 0)),
          loopMode,
        }
        for (const frame of frames) {
          compared++
          const now = replayPose(base, anim.tracks, config, frame)
          const before = oldOrderProjected(base, anim.tracks, config, frame)
          if (JSON.stringify(now) !== JSON.stringify(before)) {
            mismatches.push(`${anim.id} ${loopMode} @${frame}`)
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(1000)
    expect(mismatches).toEqual([])
    // About 2.4 s locally: a replay driver per pose.
  }, 20_000)

  it('projects a path only the generic write knows', () => {
    // plotsPerChain is not in applyTracksToFlame's list: only the generic
    // write sets it, and the projection must still reach it.
    const anim = animationDefs[0]!
    const tracks: TimelineTrack[] = [
      {
        parameterPath: 'plotsPerChain',
        keyframes: [
          { frame: 0, value: 8 },
          { frame: 10, value: 13 },
        ],
      },
    ]
    const config = { ...defaultConfig(), endFrame: 10 }
    const posed = replayPose(getAnimationFlame(anim), tracks, config, 5)
    expect(posed.renderSettings.plotsPerChain).toBe(10)
  })
})
