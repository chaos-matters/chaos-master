import { EasingCurve, KeyframeInterpolation, tryValidateTimelineSnapshot, } from '@/flame/schema/timeline'
import { TIMELINE_PARAMETERS } from '@/utils/timeline'
import * as v from '@/valibot'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineSnapshot } from '@/flame/schema/timeline'

export type CatalogType = 'number' | 'string' | 'color'
export type CatalogEntry = {
  path: string
  type: CatalogType
  group: string
  current?: unknown
}

export const MAX_CINEMA_FRAMES = 1800
export const MAX_CINEMA_TRACKS = 64
export const MAX_CINEMA_KEYFRAMES_PER_TRACK = 64

const AFFINE_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const

/**
 * Read the live value behind one `TIMELINE_PARAMETERS` path. The table is
 * flat but the document is not: camera and final-transform paths address
 * nested objects, everything else is a render setting by the same name.
 */
function renderCurrent(flame: FlameDescriptor, path: string): unknown {
  const settings = flame.renderSettings as unknown as Record<string, unknown>
  const camera = settings.camera as
    | { position?: [number, number]; zoom?: number; rotation?: number }
    | undefined
  switch (path) {
    case 'camera.x':
      return camera?.position?.[0]
    case 'camera.y':
      return camera?.position?.[1]
    case 'camera.zoom':
      return camera?.zoom
    case 'camera.rotation':
      return camera?.rotation
    default:
      break
  }
  if (path.startsWith('finalTransform.')) {
    const key = path.slice('finalTransform.'.length)
    return (flame.finalTransform as Record<string, number> | undefined)?.[key]
  }
  if (path.startsWith('camera3D.')) {
    const camera3D = settings.camera3D as Record<string, unknown> | undefined
    return camera3D?.[path.slice('camera3D.'.length)]
  }
  return settings[path]
}

/** Every path the timeline can drive for this flame, with its current value. */
export function buildAnimatableCatalog(flame: FlameDescriptor): CatalogEntry[] {
  const entries: CatalogEntry[] = TIMELINE_PARAMETERS.map((parameter) => ({
    path: parameter.path,
    type: parameter.type === 'array' ? 'color' : parameter.type,
    group: parameter.group,
    current: renderCurrent(flame, parameter.path),
  }))
  for (const [tid, transform] of Object.entries(flame.transforms ?? {})) {
    const group = `Transform ${tid}`
    for (const matrix of ['preAffine', 'postAffine'] as const) {
      const affine = transform[matrix] as Record<string, number> | undefined
      for (const key of AFFINE_KEYS) {
        entries.push({
          path: `transform.${tid}.${matrix}.${key}`,
          type: 'number',
          group,
          current: affine?.[key],
        })
      }
    }
    entries.push({
      path: `transform.${tid}.probability`,
      type: 'number',
      group,
      current: transform.probability,
    })
    entries.push({
      path: `transform.${tid}.colorSpeed`,
      type: 'number',
      group,
      current: transform.colorSpeed,
    })
    entries.push({
      path: `transform.${tid}.color.x`,
      type: 'number',
      group,
      current: transform.color?.x,
    })
    entries.push({
      path: `transform.${tid}.color.y`,
      type: 'number',
      group,
      current: transform.color?.y,
    })
    for (const [vid, variation] of Object.entries(transform.variations ?? {})) {
      entries.push({
        path: `${tid}.${vid}`,
        type: 'number',
        group: `${group} variations`,
        current: variation.weight,
      })
    }
  }
  return entries
}

const KeyframeInput = v.object({
  frame: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(MAX_CINEMA_FRAMES),
  ),
  value: v.union([
    v.number(),
    v.pipe(v.string(), v.maxLength(64)),
    v.tuple([v.number(), v.number(), v.number()]),
    v.tuple([v.number(), v.number(), v.number(), v.number()]),
  ]),
  easing: v.optional(EasingCurve),
  interp: v.optional(KeyframeInterpolation),
})

const TrackInput = v.object({
  path: v.pipe(v.string(), v.nonEmpty(), v.maxLength(512)),
  keyframes: v.pipe(
    v.array(KeyframeInput),
    v.nonEmpty(),
    v.maxLength(MAX_CINEMA_KEYFRAMES_PER_TRACK),
  ),
})

export const SetKeyframesInput = v.object({
  fps: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(60)),
    30,
  ),
  durationFrames: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(2),
    v.maxValue(MAX_CINEMA_FRAMES),
  ),
  loopMode: v.optional(v.picklist(['off', 'seamless', 'cycle']), 'off'),
  tracks: v.pipe(
    v.array(TrackInput),
    v.nonEmpty(),
    v.maxLength(MAX_CINEMA_TRACKS),
  ),
})
export type SetKeyframesInput = v.InferOutput<typeof SetKeyframesInput>

function valueType(value: unknown): CatalogType {
  return typeof value === 'number'
    ? 'number'
    : typeof value === 'string'
      ? 'string'
      : 'color'
}

/**
 * Validate agent input against the catalog and produce one
 * `timeline.loadTimeline` snapshot.
 *
 * The schema alone is not enough: a path has to exist for THIS flame, a
 * keyframe has to land inside the duration the same call declares, and the
 * value has to match the type of the parameter it drives. Every rejection
 * carries the reason so a blind agent can fix its own call.
 */
export function buildTimelineSnapshot(
  raw: unknown,
  catalog: CatalogEntry[],
):
  | { ok: true; snapshot: TimelineSnapshot; keyframeCount: number }
  | { ok: false; error: string } {
  const parsed = v.safeParse(SetKeyframesInput, raw)
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid input: ${parsed.issues
        .map((issue) => issue.message)
        .join('; ')
        .slice(0, 300)}`,
    }
  }
  const input = parsed.output
  const byPath = new Map(catalog.map((entry) => [entry.path, entry]))
  const seen = new Set<string>()
  let keyframeCount = 0
  for (const track of input.tracks) {
    const entry = byPath.get(track.path)
    if (!entry) {
      return {
        ok: false,
        error: `Unknown path "${track.path}". Call arcade_get_animatable_paths for the list.`,
      }
    }
    if (seen.has(track.path)) {
      return { ok: false, error: `Path "${track.path}" appears twice.` }
    }
    seen.add(track.path)
    let last = -1
    for (const keyframe of track.keyframes) {
      if (keyframe.frame > input.durationFrames) {
        return {
          ok: false,
          error: `Frame ${keyframe.frame} on "${track.path}" is past durationFrames ${input.durationFrames}.`,
        }
      }
      if (keyframe.frame <= last) {
        return {
          ok: false,
          error: `Keyframes on "${track.path}" must have increasing, unique frames.`,
        }
      }
      last = keyframe.frame
      const actual = valueType(keyframe.value)
      if (actual !== entry.type) {
        return {
          ok: false,
          error: `"${track.path}" expects a ${entry.type} value, got ${actual}.`,
        }
      }
      keyframeCount++
    }
  }
  const snapshot = {
    config: {
      fps: input.fps,
      timeScale: 1,
      startFrame: 0,
      endFrame: input.durationFrames,
      loop: true,
      autoFps: false,
      loopMode: input.loopMode,
    },
    currentFrame: 0,
    animationEnabled: true,
    tracks: input.tracks.map((track) => ({
      parameterPath: track.path,
      keyframes: track.keyframes.map((keyframe) => ({
        frame: keyframe.frame,
        value: keyframe.value,
        easing: keyframe.easing ?? 'linear',
        interp: keyframe.interp ?? 'linear',
      })),
    })),
  }
  const validated = tryValidateTimelineSnapshot(snapshot)
  if (!validated) {
    return {
      ok: false,
      error:
        'The timeline snapshot did not pass validation (a limit was exceeded).',
    }
  }
  return { ok: true, snapshot: validated, keyframeCount }
}
