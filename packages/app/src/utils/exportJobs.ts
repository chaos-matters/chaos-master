import { createStore, produce } from 'solid-js/store'
import type { AudioMappingEntry } from './audioAnalysis'
import type { TimelineConfig, TimelineTrack } from './timeline'
import type { VideoEncoderConfig } from './videoEncoder'
import type { Palette } from '@/flame/colorMap'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ReplayGlideOptions } from '@/recorder/glide'
import type { RecordedSession } from '@/recorder/schema'

export type ReplayVideoSpec = {
  version: 1
  playbackSpeed: number
  leadInMs: number
  tailMs: number
  /**
   * Whether steps glide into place, and how long for.
   *
   * Optional and additive: a job spec written before this simply lacks it and
   * every step cuts, which is what replay video has always produced.
   */
  glide?: ReplayGlideOptions
}

/**
 * Background export jobs. Image (and opt-in animation) exports run OFFSCREEN (see
 * ExportJobHost) so the workspace stays usable while they render; the
 * ExportJobTracker popup shows each job's progress and offers a download when it
 * finishes. Jobs render sequentially — the host always renders the first job
 * that is queued/rendering.
 */

type Dimensions = { width: number; height: number }
type JobResult = {
  blobUrl: string
  width: number
  height: number
  /** Animation only: number of frames actually encoded (may be < total if the
   *  user used Stop & Save). */
  frames?: number
  /** Animation only: PNG object URL of the first rendered frame, used as the
   *  <video> poster so the tracker shows a real frame instead of a blank/green
   *  undecoded video frame. */
  posterUrl?: string
}

/** Everything needed to render one image export, snapshotted at enqueue time so
 *  later edits to the workspace flame don't affect an in-flight job. */
export type ImageJobSpec = {
  name: string
  /** What the job renders and embeds: the flame that produced the pixels the
   *  user was looking at, audio overlay and all. */
  flame: FlameDescriptor
  /** What Recents files when the job finishes. The document, which the overlay
   *  above never touched - the artifact and the user's work are different
   *  things, and only one of them is a frame of a song. Required, so a new
   *  enqueue site has to answer the question rather than inherit the wrong
   *  half by leaving an argument out. */
  authoredFlame: FlameDescriptor
  quality: number
  dimensions: Dimensions
  palette: Palette | undefined
  blendFlame: FlameDescriptor | undefined
  blendWeight: number
  embedFlame: boolean
  embedAnimation: boolean
  condenseHidden: boolean
  tracks: TimelineTrack[]
  config: TimelineConfig
  /** Recorded session to embed alongside the flame, snapshotted at enqueue time
   *  like everything else here — a recording started while the job renders must
   *  not leak into an image it did not produce. Undefined when there is no
   *  finished recording or the user opted out. */
  session: RecordedSession | undefined
}

/** Everything needed to render one animation (video) export offscreen. `flame`
 *  is the RAW flame (timeline applied per-frame by the runner). */
export type AnimationJobSpec = {
  name: string
  flame: FlameDescriptor
  quality: number
  dimensions: Dimensions
  fps: number
  frameStart: number
  frameEnd: number
  playCount: number
  codec: VideoEncoderConfig['codec']
  embedMetadata: boolean
  palette: Palette | undefined
  blendFlame: FlameDescriptor | undefined
  blendWeight: number
  tracks: TimelineTrack[]
  config: TimelineConfig
  /** Recording association captured when the job was enqueued. */
  session: RecordedSession | undefined
  /** Present for a branded creation replay rather than a timeline render. */
  replayVideo?: ReplayVideoSpec
  audioBuffer?: AudioBuffer
  audioMapping?: AudioMappingEntry[]
  motionBlurSamples?: number
  shutterAngle?: number
}

export type ExportJobStatus = 'queued' | 'rendering' | 'done' | 'error'

type JobCommon = {
  id: string
  status: ExportJobStatus
  startedAt: number
  /** Set via requestJobForceExport — capture/finalize at the current state
   *  ("Stop & Export" / "Stop & Save"). */
  forceExport: boolean
  /** True once the render is done and the file is being captured/encoded — the
   *  tracker shows "Finalizing…" and hides the stop action so it can't re-fire. */
  finalizing?: boolean
  result?: JobResult
  /** Set once the user has downloaded the finished result — drives the
   *  before-unload "you have undownloaded exports" guard. */
  downloaded?: boolean
  error?: string
}

export type ImageJob = JobCommon &
  ImageJobSpec & {
    type: 'image'
    progress: { current: number; target: number }
  }

export type AnimationJob = JobCommon &
  AnimationJobSpec & {
    type: 'animation'
    progress: {
      frame: number
      totalFrames: number
      phase: 'rendering' | 'encoding'
      /** Point progress within the frame currently rendering. */
      currentPoints: number
      targetPoints: number
    }
  }

export type ExportJob = ImageJob | AnimationJob

const [store, setStore] = createStore<{ items: ExportJob[] }>({ items: [] })

let nextId = 1

/** Reactive accessor over the job list. */
export const exportJobs = () => store.items

export function enqueueImageJob(spec: ImageJobSpec): string {
  const id = `job-${nextId++}`
  setStore('items', (items) => [
    ...items,
    {
      ...spec,
      id,
      type: 'image',
      status: 'queued',
      progress: { current: 0, target: 0 },
      startedAt: globalThis.performance.now(),
      forceExport: false,
    },
  ])
  return id
}

export function enqueueAnimationJob(spec: AnimationJobSpec): string {
  const id = `job-${nextId++}`
  const totalFrames =
    (spec.frameEnd - spec.frameStart + 1) * Math.max(1, spec.playCount)
  setStore('items', (items) => [
    ...items,
    {
      ...spec,
      id,
      type: 'animation',
      status: 'queued',
      progress: {
        frame: 0,
        totalFrames,
        phase: 'rendering',
        currentPoints: 0,
        targetPoints: 0,
      },
      startedAt: globalThis.performance.now(),
      forceExport: false,
    },
  ])
  return id
}

export function setJobStatus(id: string, status: ExportJobStatus) {
  setStore('items', (j) => j.id === id, 'status', status)
}

export function setImageJobProgress(
  id: string,
  current: number,
  target: number,
) {
  setStore(
    'items',
    (j) => j.id === id,
    produce((j) => {
      if (j.type === 'image') j.progress = { current, target }
    }),
  )
}

export function setAnimationJobProgress(
  id: string,
  frame: number,
  totalFrames: number,
  phase: 'rendering' | 'encoding',
) {
  setStore(
    'items',
    (j) => j.id === id,
    produce((j) => {
      if (j.type === 'animation') {
        // Frame/phase change resets the per-frame point progress.
        j.progress = {
          frame,
          totalFrames,
          phase,
          currentPoints: 0,
          targetPoints: 0,
        }
      }
    }),
  )
}

/** Per-frame point progress for the animation frame currently rendering. */
export function setAnimationJobPoints(
  id: string,
  currentPoints: number,
  targetPoints: number,
) {
  setStore(
    'items',
    (j) => j.id === id,
    produce((j) => {
      if (j.type === 'animation') {
        j.progress.currentPoints = currentPoints
        j.progress.targetPoints = targetPoints
      }
    }),
  )
}

export function setJobResult(id: string, result: JobResult) {
  setStore('items', (j) => j.id === id, 'result', result)
  setStore('items', (j) => j.id === id, 'status', 'done')
}

export function setJobError(id: string, error: string) {
  setStore('items', (j) => j.id === id, 'error', error)
  setStore('items', (j) => j.id === id, 'status', 'error')
}

export function requestJobForceExport(id: string) {
  setStore('items', (j) => j.id === id, 'forceExport', true)
}

export function setJobFinalizing(id: string) {
  setStore('items', (j) => j.id === id, 'finalizing', true)
}

export function jobExists(id: string): boolean {
  return store.items.some((j) => j.id === id)
}

export function markJobDownloaded(id: string) {
  setStore('items', (j) => j.id === id, 'downloaded', true)
}

/** True while there is work the user likely doesn't want to lose on reload: a
 *  job still rendering/queued, or a finished one they haven't downloaded yet. */
export function hasPendingExportJobs(): boolean {
  return store.items.some(
    (j) =>
      j.status === 'queued' ||
      j.status === 'rendering' ||
      (j.status === 'done' && !j.downloaded),
  )
}

/**
 * Remove a job from the tracker, releasing its result blob URL. Used both to
 * cancel an in-flight job (the host unmounts it — no file is saved) and to
 * dismiss a finished one.
 */
export function dismissJob(id: string) {
  const job = store.items.find((j) => j.id === id)
  if (job?.result) {
    URL.revokeObjectURL(job.result.blobUrl)
    if (job.result.posterUrl) URL.revokeObjectURL(job.result.posterUrl)
  }
  setStore('items', (items) => items.filter((j) => j.id !== id))
}

/** One job, summarised small enough to sit in a tool result. */
export type ExportJobSummary = {
  id: string
  name: string
  type: 'image' | 'animation'
  status: ExportJobStatus
  /** 0..1 over the job's own work: frames for an animation, points for an
   *  image. 0 before the host has reported anything. */
  progress: number
  /** Animation only: frames a full render will encode, from the queued spec. */
  totalFrames?: number
}

/** What a finished job left behind, including how to recognise its file. */
export type FinishedExportJobSummary = ExportJobSummary & {
  width: number
  height: number
  /** Animation only: frames actually encoded (fewer after Stop & Save). */
  frames?: number
  /** True once the tracker's Download link has been used. */
  downloaded: boolean
}

/**
 * The export queue as a script sees it.
 *
 * A driver that queues a render has no window to look at: it needs to know
 * that something is still rendering, which job was the last one it queued, and
 * whether the finished file is the size and length it asked for. That is the
 * whole of this shape — `export.jobStatus` returns it verbatim.
 */
export type ExportQueueState = {
  total: number
  /** Queued plus rendering. */
  pending: number
  /** `hasPendingExportJobs()`: also true for a finished, undownloaded job. */
  hasPending: boolean
  /** The job the host is rendering right now, if any. */
  active?: ExportJobSummary
  /** The most recently enqueued job, whatever its status. */
  latest?: ExportJobSummary
  /** The most recent job that finished successfully. */
  lastFinished?: FinishedExportJobSummary
  /** The most recent failure, so a poller can stop instead of spinning. */
  error?: { id: string; name: string; message: string }
}

function summarise(job: ExportJob): ExportJobSummary {
  const progress =
    job.type === 'animation'
      ? job.progress.totalFrames > 0
        ? job.progress.frame / job.progress.totalFrames
        : 0
      : job.progress.target > 0
        ? job.progress.current / job.progress.target
        : 0
  return {
    id: job.id,
    name: job.name,
    type: job.type,
    status: job.status,
    progress: Math.min(1, Math.max(0, progress)),
    ...(job.type === 'animation'
      ? { totalFrames: job.progress.totalFrames }
      : {}),
  }
}

/** Snapshot of the export queue for scripted exports — see ExportQueueState. */
export function exportQueueState(): ExportQueueState {
  const items = store.items
  const active = items.find((j) => j.status === 'rendering')
  const latest = items.at(-1)
  const finished = items.filter((j) => j.status === 'done' && j.result).at(-1)
  const failed = items.filter((j) => j.status === 'error').at(-1)
  return {
    total: items.length,
    pending: items.filter(
      (j) => j.status === 'queued' || j.status === 'rendering',
    ).length,
    hasPending: hasPendingExportJobs(),
    ...(active ? { active: summarise(active) } : {}),
    ...(latest ? { latest: summarise(latest) } : {}),
    ...(finished?.result
      ? {
          lastFinished: {
            ...summarise(finished),
            width: finished.result.width,
            height: finished.result.height,
            ...(finished.result.frames !== undefined
              ? { frames: finished.result.frames }
              : {}),
            downloaded: finished.downloaded === true,
          },
        }
      : {}),
    ...(failed
      ? {
          error: {
            id: failed.id,
            name: failed.name,
            message: failed.error ?? 'Export failed',
          },
        }
      : {}),
  }
}
