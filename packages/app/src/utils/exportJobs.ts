import { createStore, produce } from 'solid-js/store'
import type { TimelineConfig, TimelineTrack } from './timeline'
import type { VideoEncoderConfig } from './videoEncoder'
import type { Palette } from '@/flame/colorMap'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * Background export jobs. Image (and opt-in animation) exports run OFFSCREEN (see
 * ExportJobHost) so the workspace stays usable while they render; the
 * ExportJobTracker popup shows each job's progress and offers a download when it
 * finishes. Jobs render sequentially — the host always renders the first job
 * that is queued/rendering.
 */

type Dimensions = { width: number; height: number }
type JobResult = { blobUrl: string; width: number; height: number }

/** Everything needed to render one image export, snapshotted at enqueue time so
 *  later edits to the workspace flame don't affect an in-flight job. */
export type ImageJobSpec = {
  name: string
  flame: FlameDescriptor
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
}

export type ExportJobStatus = 'queued' | 'rendering' | 'done' | 'error'

type JobCommon = {
  id: string
  status: ExportJobStatus
  startedAt: number
  /** Set via requestJobForceExport — capture/finalize at the current state
   *  ("Stop & Export" / "Stop & Save"). */
  forceExport: boolean
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
      progress: { frame: 0, totalFrames, phase: 'rendering' },
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
      if (j.type === 'animation') j.progress = { frame, totalFrames, phase }
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
  }
  setStore('items', (items) => items.filter((j) => j.id !== id))
}
