/**
 * The same motion, expressed as keyframe data.
 *
 * `channels` is what the runtime and the offline exporter sample. `tracks` is
 * the same thing in the vocabulary everything else in the app already speaks,
 * so a consumer that takes tracks — the dope sheet, the animation job spec —
 * can take a glide without knowing what a glide is. The two are held together
 * by a test asserting
 * `applyTracksToFlame(tracks, clone(base), f) === sampleGlide(plan, f/frames)`.
 *
 * A channel that moves linearly in eased time needs exactly two keyframes,
 * because that is precisely what `resolveKeyframeValue` computes for a
 * two-keyframe segment. A curved one — a decomposed affine, a log-space zoom,
 * a shortest-arc rotation — is baked one keyframe per frame, which is exact at
 * every integer frame and is the reason the budget needs watching.
 */

import { MAX_TIMELINE_KEYFRAMES, MAX_TIMELINE_KEYFRAMES_PER_TRACK, MAX_TIMELINE_TRACKS, } from '@/flame/schema/timeline'
import { reduceTrack } from './decimate'
import { channelValuesAt } from './sample'
import type { GlideChannel, GlideNote } from './types'
import type { Keyframe, TimelineTrack } from '@/flame/schema/timeline'

/** How much a value may move before decimation has to keep the keyframe. */
export const GLIDE_DECIMATION_TOLERANCE = 1e-4

/** True when the channel's value is a straight line in eased time. */
export function isStraightChannel(channel: GlideChannel): boolean {
  if (channel.kind === 'affine') return channel.mode === 'linear'
  if (channel.kind === 'scalar') return channel.mode === 'linear'
  return true
}

/** The paths a channel writes, in the order it writes them. */
export function channelPaths(channel: GlideChannel): string[] {
  return channel.kind === 'affine'
    ? channel.components.map((component) => `${channel.prefix}.${component}`)
    : [channel.path]
}

export function glideTrackCost(
  channels: readonly GlideChannel[],
  frames: number,
): { tracks: number; keyframes: number } {
  let tracks = 0
  let keyframes = 0
  for (const channel of channels) {
    const paths = channelPaths(channel).length
    tracks += paths
    keyframes += paths * (isStraightChannel(channel) ? 2 : frames + 1)
  }
  return { tracks, keyframes }
}

function straightKeyframes(
  channel: GlideChannel,
  path: string,
  frames: number,
): Keyframe[] {
  const first = channelValuesAt(channel, 0).find(
    (entry) => entry.path === path,
  )!
  const last = channelValuesAt(channel, 1).find((entry) => entry.path === path)!
  const easing = channel.kind === 'text' ? 'linear' : channel.easing
  return [
    {
      frame: 0,
      value: first.value as Keyframe['value'],
      easing: 'linear',
      interp: 'linear',
    },
    {
      frame: frames,
      value: last.value as Keyframe['value'],
      easing,
      interp: 'linear',
    },
  ]
}

function bakedKeyframes(
  channel: GlideChannel,
  path: string,
  frames: number,
): Keyframe[] {
  const keyframes: Keyframe[] = []
  for (let frame = 0; frame <= frames; frame++) {
    const entry = channelValuesAt(channel, frame / frames).find(
      (candidate) => candidate.path === path,
    )
    if (!entry) continue
    // Easing is already baked INTO the values, so the segments between them
    // are straight. Putting the curve here as well would apply it twice.
    keyframes.push({
      frame,
      value: entry.value as Keyframe['value'],
      easing: 'linear',
      interp: 'linear',
    })
  }
  return keyframes
}

export function buildGlideTracks(
  channels: readonly GlideChannel[],
  frames: number,
): { tracks: TimelineTrack[]; notes: GlideNote[] } {
  const notes: GlideNote[] = []
  const cost = glideTrackCost(channels, frames)
  if (cost.tracks > MAX_TIMELINE_TRACKS) {
    notes.push({
      kind: 'trackBudget',
      reason: `the union needs ${cost.tracks} tracks and a timeline holds ${MAX_TIMELINE_TRACKS}; the glide still plays, but it carries no keyframe form`,
    })
    return { tracks: [], notes }
  }

  const tracks: TimelineTrack[] = []
  for (const channel of channels) {
    const straight = isStraightChannel(channel)
    for (const path of channelPaths(channel)) {
      tracks.push({
        parameterPath: path,
        keyframes: straight
          ? straightKeyframes(channel, path, frames)
          : bakedKeyframes(channel, path, frames),
      })
    }
  }

  if (cost.keyframes <= MAX_TIMELINE_KEYFRAMES) return { tracks, notes }

  // Last resort. `planGlide` has already straightened every curved channel it
  // could before reaching here, so the remaining cost is unavoidable and the
  // only lever left is one that makes the tracks approximate.
  let reduced = 0
  for (const track of tracks) {
    if (track.keyframes.length <= 2) continue
    const next = reduceTrack(track.keyframes, GLIDE_DECIMATION_TOLERANCE)
    if (next.length < track.keyframes.length) {
      reduced += track.keyframes.length - next.length
      track.keyframes = next
    }
  }
  for (const track of tracks) {
    if (track.keyframes.length > MAX_TIMELINE_KEYFRAMES_PER_TRACK) {
      track.keyframes = track.keyframes.slice(
        0,
        MAX_TIMELINE_KEYFRAMES_PER_TRACK,
      )
    }
  }
  notes.push({
    kind: 'trackBudget',
    reason: `baking needed ${cost.keyframes} keyframes and a timeline holds ${MAX_TIMELINE_KEYFRAMES}; ${reduced} were decimated, so the keyframe form now matches the glide only to within ${GLIDE_DECIMATION_TOLERANCE}`,
  })
  return { tracks, notes }
}
