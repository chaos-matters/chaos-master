import { EasingCurve, KeyframeInterpolation, tryValidateTimelineSnapshot, } from '@/flame/schema/timeline'
import { TIMELINE_PARAMETERS } from '@/utils/timeline'
import * as v from '@/valibot'
import { AFFINE_TERMS, affineLayoutOf } from './affineTerms'
import type { AffineLayout } from './affineTerms'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineSnapshot } from '@/flame/schema/timeline'
import type { TimelineTrack } from '@/utils/timeline'

export type CatalogType = 'number' | 'string' | 'color'
export type CatalogEntry = {
  path: string
  type: CatalogType
  group: string
  current?: unknown
  /** What the parameter is, where the path alone does not say: an affine
   *  term's row and input (`y from x`), or that it is a translation. */
  description?: string
}

export const MAX_CINEMA_FRAMES = 1800
export const MAX_CINEMA_TRACKS = 64
export const MAX_CINEMA_KEYFRAMES_PER_TRACK = 64

function affineEntries(
  prefix: string,
  affine: Record<string, unknown> | undefined,
  layout: AffineLayout,
  group: string,
): CatalogEntry[] {
  return Object.entries(AFFINE_TERMS[layout]).map(([key, description]) => ({
    path: `${prefix}.${key}`,
    type: 'number',
    group,
    current: affine?.[key],
    description,
  }))
}

/**
 * The final transform's layout, read as any affine's is, or, when the flame
 * has none yet, the one the timeline creates for it (a 3D identity on a 3D flame,
 * `applyFinalTransformTracks` in utils/timeline.ts).
 */
function finalTransformLayout(flame: FlameDescriptor): AffineLayout {
  const final = flame.finalTransform as Record<string, unknown> | undefined
  const dimensions = flame.renderSettings.dimensions
  if (final) return affineLayoutOf(final, dimensions)
  return dimensions === 3 ? '3D' : '2D'
}

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
/**
 * The camera family that does NOT drive this flame's render.
 *
 * A flame renders through exactly one of two pipelines, and they take
 * different cameras: `createIFSPipeline3D` is handed `camera3D` and never sees
 * the 2D camera, while `createIFSPipeline` is handed the 2D one and never sees
 * `camera3D` (Flam3.tsx). Offering both to an agent is offering a set of
 * controls that are wired to nothing — it animated `camera.zoom` across a 3D
 * flame, read the resolved values back off the timeline to check its work
 * (they were correct), and got a picture that never moved.
 */
function deadCameraPrefix(flame: FlameDescriptor): string {
  return flame.renderSettings.dimensions === 3 ? 'camera.' : 'camera3D.'
}

export function buildAnimatableCatalog(flame: FlameDescriptor): CatalogEntry[] {
  const dead = deadCameraPrefix(flame)
  const entries: CatalogEntry[] = TIMELINE_PARAMETERS.filter(
    (parameter) => !parameter.path.startsWith(dead),
  ).flatMap((parameter): CatalogEntry[] => {
    // The table lists the final transform as a-f; the flame's own layout
    // decides which terms it has and what each one is.
    if (parameter.path.startsWith('finalTransform.')) {
      return parameter.path === 'finalTransform.a'
        ? affineEntries(
            'finalTransform',
            flame.finalTransform,
            finalTransformLayout(flame),
            parameter.group,
          )
        : []
    }
    return [
      {
        path: parameter.path,
        type: parameter.type === 'array' ? 'color' : parameter.type,
        group: parameter.group,
        current: renderCurrent(flame, parameter.path),
      },
    ]
  })
  for (const [tid, transform] of Object.entries(flame.transforms ?? {})) {
    const group = `Transform ${tid}`
    for (const matrix of ['preAffine', 'postAffine'] as const) {
      const affine = transform[matrix] as Record<string, unknown> | undefined
      entries.push(
        ...affineEntries(
          `transform.${tid}.${matrix}`,
          affine,
          affineLayoutOf(affine, flame.renderSettings.dimensions),
          group,
        ),
      )
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

/**
 * The one asymmetry in the path grammar: everything on a transform is
 * addressed `transform.<tid>.<what>`, but a variation weight is `<tid>.<vid>`
 * and a variation parameter `<tid>.<vid>.<name>` — no prefix. That is what the
 * timeline resolver has always written and what every saved animation stores,
 * so the format cannot move; agents reach for the prefixed form anyway and
 * burn a call on the rejection. Any prefixed path that resolves to a real
 * catalog entry once the prefix is dropped is accepted and rewritten to the
 * canonical one, so the stored track is the same either way — the variation
 * forms are the ones this exists for, but `transform.gamma` costing nothing
 * is a feature, not an accident. The unprefixed path is looked up FIRST, so a
 * variation that happens to be called `probability` cannot shadow one.
 */
/**
 * "Unknown path" is the wrong thing to say about `camera.zoom`.
 *
 * It exists, it is in the schema, the timeline will happily resolve it — it
 * just is not connected to the pipeline that renders THIS flame. Saying so,
 * and naming the family that is, turns a silent still frame into one call.
 * Which family is live is read back off the catalog, so this cannot disagree
 * with what `arcade_get_animatable_paths` just offered.
 */
function wrongCameraFamilyError(
  byPath: ReadonlyMap<string, CatalogEntry>,
  path: string,
): string | undefined {
  const rendersIn3D = byPath.has('camera3D.radius')
  if (rendersIn3D && path.startsWith('camera.')) {
    return `"${path}" is the 2D camera and a 3D flame does not render through it. Animate camera3D.theta, camera3D.phi, camera3D.radius or camera3D.fov instead (theta and phi are radians; a full turn is 2*PI).`
  }
  if (!rendersIn3D && path.startsWith('camera3D.')) {
    return `"${path}" is the 3D camera and a 2D flame does not render through it. Animate camera.x, camera.y, camera.zoom or camera.rotation instead (rotation is radians; a full turn is 2*PI).`
  }
  return undefined
}

/**
 * "Unknown path" is also the wrong thing to say about `preAffine.g` on an
 * affine in the 2D layout: the term exists in the other layout, and the agent
 * needs to know which terms this one has and what they are.
 */
function wrongAffineLayoutError(
  byPath: ReadonlyMap<string, CatalogEntry>,
  path: string,
): string | undefined {
  const match = /^(.+)\.([g-l])$/.exec(path)
  if (!match) return undefined
  const prefix = match[1]!
  if (!byPath.has(`${prefix}.f`) || byPath.has(`${prefix}.g`)) return undefined
  return `"${path}" is not a term of this affine: it is in the 2D layout, a-f (x'=ax+by+c, y'=dx+ey+f; c and f are the translation). g-l exist only on 3D-layout affines of a 3D flame. Call arcade_get_animatable_paths for each transform's layout.`
}

/** Why a path the catalog does not hold was refused, as specifically as the
 *  catalog lets it say. */
function unknownPathError(
  byPath: ReadonlyMap<string, CatalogEntry>,
  path: string,
): string {
  return (
    wrongCameraFamilyError(byPath, path) ??
    wrongAffineLayoutError(byPath, path) ??
    `Unknown path "${path}". Call arcade_get_animatable_paths for the list.`
  )
}

function canonicalPath(
  byPath: ReadonlyMap<string, CatalogEntry>,
  path: string,
): string | undefined {
  if (byPath.has(path)) return path
  if (!path.startsWith('transform.')) return undefined
  const stripped = path.slice('transform.'.length)
  return byPath.has(stripped) ? stripped : undefined
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
  mode: v.optional(v.picklist(['replace', 'add']), 'replace'),
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
  /**
   * What the timeline already holds, for `mode: 'add'`.
   *
   * A whole animation arriving as one call is one step in the log and one
   * thing for the viewer to watch, which is the wrong shape for both: the
   * lesson reads as a single opaque jump, and nobody sees a beat land. Adding
   * lets the agent send one idea at a time without resending everything it
   * has already placed. A path present in both wins from the new call, so a
   * second pass over the same track is a correction rather than a duplicate.
   */
  existingTracks: readonly TimelineTrack[] = [],
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
  const canonical = new Map<string, string>()
  let keyframeCount = 0
  for (const track of input.tracks) {
    const path = canonicalPath(byPath, track.path)
    const entry = path === undefined ? undefined : byPath.get(path)
    if (entry === undefined || path === undefined) {
      return {
        ok: false,
        error: unknownPathError(byPath, track.path),
      }
    }
    canonical.set(track.path, path)
    if (seen.has(path)) {
      return { ok: false, error: `Path "${path}" appears twice.` }
    }
    seen.add(path)
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
  const additions = input.tracks.map((track) => ({
    parameterPath: canonical.get(track.path) ?? track.path,
    keyframes: track.keyframes.map((keyframe) => ({
      frame: keyframe.frame,
      value: keyframe.value,
      easing: keyframe.easing ?? 'linear',
      interp: keyframe.interp ?? 'linear',
    })),
  }))
  const kept =
    input.mode === 'add'
      ? existingTracks.filter((track) => !seen.has(track.parameterPath))
      : []
  for (const track of kept) {
    const last = track.keyframes.at(-1)
    if (last !== undefined && last.frame > input.durationFrames) {
      return {
        ok: false,
        error: `durationFrames ${input.durationFrames} would cut the existing track "${track.parameterPath}", which runs to frame ${last.frame}. This flame arrived with its own animation: use durationFrames ${last.frame} or more to build on it, send mode "replace" to drop it, or empty the timeline first with execute_command timeline.clearTracks.`,
      }
    }
  }
  const merged = [...kept, ...additions]
  if (merged.length > MAX_CINEMA_TRACKS) {
    return {
      ok: false,
      error: `That would leave ${merged.length} tracks; the limit is ${MAX_CINEMA_TRACKS}.`,
    }
  }
  for (const track of kept) {
    keyframeCount += track.keyframes.length
  }

  const snapshot = {
    config: {
      fps: input.fps,
      timeScale: 1,
      startFrame: 0,
      endFrame: input.durationFrames,
      // Never looping. An agent's preview plays once and stops, because the
      // agent cannot see the result and would otherwise leave the GPU running
      // the animation for the whole time it spends thinking about the next
      // call. The viewer turns looping on themselves once the take is theirs.
      loop: false,
      autoFps: false,
      loopMode: input.loopMode,
    },
    currentFrame: 0,
    animationEnabled: true,
    tracks: merged,
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
