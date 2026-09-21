/**
 * Scripted export requests: the narrow, JSON-shaped options a script or an
 * agent sends to `export.renderImage` / `export.renderAnimation`, and the
 * limits they are held to.
 *
 * The limits are the export modal's own (ExportPngDialog): the quality
 * slider's range, the FPS input's 12-60, the codec list, "end frame after
 * start frame", and the longest edge the resolution picker offers. A scripted
 * export that could ask for something the modal refuses would be a second,
 * looser export path rather than the same one without the dialog — so the
 * numbers live here and both sides read them.
 */

import type { TimelineConfig, TimelineTrack } from './timeline'
import type { VideoEncoderConfig } from './videoEncoder'

/** Quality slider range in ExportPngDialog (image and animation tabs). */
export const EXPORT_QUALITY_MIN = 0.5
export const EXPORT_QUALITY_MAX = 0.9999
export const EXPORT_QUALITY_DEFAULT = 0.9

/** The FPS number input's min/max on the animation tab. */
export const EXPORT_FPS_MIN = 12
export const EXPORT_FPS_MAX = 60

/** The longest edge the resolution picker offers (4K), and a floor that stops
 *  a typo queueing a job nobody can see. */
export const EXPORT_EDGE_MIN = 16
export const EXPORT_EDGE_MAX = 4096

/**
 * Frames one scripted animation job may render. The modal needs no cap: a
 * human watches the progress bar and can press Stop & Save. A script polling
 * `export.jobStatus` cannot, so a fat-fingered frame range must not become an
 * hour of GPU time. 60 s at 60 fps.
 */
export const EXPORT_MAX_FRAMES = 3600

/** The codecs the modal's codec picker offers. */
export const EXPORT_CODECS: readonly VideoEncoderConfig['codec'][] = [
  'avc',
  'hevc',
  'vp9',
]

/** Embed the flame in the PNG by default, as the modal's checkbox does. */
export const EXPORT_EMBED_FLAME_DEFAULT = true

export type ImageRenderRequest = {
  width: number
  height: number
  quality?: number
  embedFlame?: boolean
}

export type AnimationRenderRequest = {
  width: number
  height: number
  fps: number
  frameStart?: number
  frameEnd?: number
  codec?: VideoEncoderConfig['codec']
  quality?: number
}

/** An image request with every optional field resolved. */
export type NormalizedImageRender = {
  width: number
  height: number
  quality: number
  embedFlame: boolean
}

/** An animation request with the optional fields resolved, except the frame
 *  range: `undefined` there means "whatever the modal would have offered",
 *  which only the workspace's live timeline knows. */
export type NormalizedAnimationRender = {
  width: number
  height: number
  fps: number
  frameStart: number | undefined
  frameEnd: number | undefined
  codec: VideoEncoderConfig['codec']
  quality: number
}

export type RequestResult<T> = { error: string } | { request: T }

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** Round to the nearest even integer: video encoders reject odd dimensions,
 *  and `computeExportDimensions` rounds the modal's sizes the same way. */
function toEven(n: number): number {
  const r = Math.round(n)
  return r % 2 === 0 ? r : r + 1
}

function edgeOrReason(value: unknown, field: string): number | string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `"${field}" must be a number of pixels`
  }
  if (value < EXPORT_EDGE_MIN || value > EXPORT_EDGE_MAX) {
    return `"${field}" must be between ${EXPORT_EDGE_MIN} and ${EXPORT_EDGE_MAX} pixels`
  }
  return toEven(value)
}

function qualityOrReason(value: unknown): number | string {
  if (value === undefined) return EXPORT_QUALITY_DEFAULT
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '"quality" must be a number'
  }
  if (value < EXPORT_QUALITY_MIN || value > EXPORT_QUALITY_MAX) {
    return `"quality" must be between ${EXPORT_QUALITY_MIN} and ${EXPORT_QUALITY_MAX}`
  }
  return value
}

function frameOrReason(
  value: unknown,
  field: string,
): number | undefined | string {
  if (value === undefined) return undefined
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 1_000_000
  ) {
    return `"${field}" must be a whole frame number`
  }
  return value
}

/** Validate a scripted PNG render request. */
export function normalizeImageRenderRequest(
  value: unknown,
): RequestResult<NormalizedImageRender> {
  if (!isPlainRecord(value)) {
    return { error: 'render image expects one options object' }
  }
  const width = edgeOrReason(value.width, 'width')
  if (typeof width === 'string') return { error: width }
  const height = edgeOrReason(value.height, 'height')
  if (typeof height === 'string') return { error: height }
  const quality = qualityOrReason(value.quality)
  if (typeof quality === 'string') return { error: quality }
  if (value.embedFlame !== undefined && typeof value.embedFlame !== 'boolean') {
    return { error: '"embedFlame" must be true or false' }
  }
  return {
    request: {
      width,
      height,
      quality,
      embedFlame: value.embedFlame ?? EXPORT_EMBED_FLAME_DEFAULT,
    },
  }
}

/** Validate a scripted animation render request. */
export function normalizeAnimationRenderRequest(
  value: unknown,
): RequestResult<NormalizedAnimationRender> {
  if (!isPlainRecord(value)) {
    return { error: 'render animation expects one options object' }
  }
  const width = edgeOrReason(value.width, 'width')
  if (typeof width === 'string') return { error: width }
  const height = edgeOrReason(value.height, 'height')
  if (typeof height === 'string') return { error: height }
  const quality = qualityOrReason(value.quality)
  if (typeof quality === 'string') return { error: quality }
  const fps = value.fps
  if (
    typeof fps !== 'number' ||
    !Number.isInteger(fps) ||
    fps < EXPORT_FPS_MIN ||
    fps > EXPORT_FPS_MAX
  ) {
    return {
      error: `"fps" must be a whole number between ${EXPORT_FPS_MIN} and ${EXPORT_FPS_MAX}`,
    }
  }
  const frameStart = frameOrReason(value.frameStart, 'frameStart')
  if (typeof frameStart === 'string') return { error: frameStart }
  const frameEnd = frameOrReason(value.frameEnd, 'frameEnd')
  if (typeof frameEnd === 'string') return { error: frameEnd }
  if (
    frameStart !== undefined &&
    frameEnd !== undefined &&
    frameEnd <= frameStart
  ) {
    return { error: '"frameEnd" must be after "frameStart"' }
  }
  if (
    frameStart !== undefined &&
    frameEnd !== undefined &&
    frameEnd - frameStart + 1 > EXPORT_MAX_FRAMES
  ) {
    return {
      error: `a scripted animation renders at most ${EXPORT_MAX_FRAMES} frames`,
    }
  }
  const codec = value.codec
  if (
    codec !== undefined &&
    !EXPORT_CODECS.includes(codec as VideoEncoderConfig['codec'])
  ) {
    return { error: `"codec" must be one of ${EXPORT_CODECS.join(', ')}` }
  }
  return {
    request: {
      width,
      height,
      fps,
      frameStart,
      frameEnd,
      codec: (codec as VideoEncoderConfig['codec'] | undefined) ?? 'avc',
      quality,
    },
  }
}

/**
 * The frame range the animation tab opens with: the timeline's start frame up
 * to the last keyframe on any track, so nothing renders past the last
 * meaningful change — falling back to the configured end frame when there are
 * no keyframes at all.
 */
export function defaultExportFrameRange(
  tracks: readonly TimelineTrack[],
  config: TimelineConfig,
): { frameStart: number; frameEnd: number } {
  const lastKeyframeFrame = tracks.reduce(
    (max, track) =>
      track.keyframes.reduce((m, kf) => Math.max(m, kf.frame), max),
    0,
  )
  return {
    frameStart: config.startFrame,
    frameEnd: lastKeyframeFrame > 0 ? lastKeyframeFrame : config.endFrame,
  }
}

/**
 * Resolve a scripted request's frame range against the live timeline, then
 * hold it to the same rules the modal's inputs do: end after start, and never
 * more than `EXPORT_MAX_FRAMES`. Clamping rather than refusing is deliberate —
 * the omitted range comes from the timeline, not from the caller, so there is
 * nothing for them to have got wrong; `export.jobStatus` reports the frame
 * count that was actually queued.
 */
export function resolveExportFrameRange(
  request: NormalizedAnimationRender,
  tracks: readonly TimelineTrack[],
  config: TimelineConfig,
): { frameStart: number; frameEnd: number } {
  const fallback = defaultExportFrameRange(tracks, config)
  const frameStart = request.frameStart ?? fallback.frameStart
  const requested = request.frameEnd ?? fallback.frameEnd
  const frameEnd = Math.min(
    Math.max(requested, frameStart + 1),
    frameStart + EXPORT_MAX_FRAMES - 1,
  )
  return { frameStart, frameEnd }
}
