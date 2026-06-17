import { createStore } from 'solid-js/store'
import type { TimelineConfig, TimelineTrack } from './timeline'
import type { Palette } from '@/flame/colorMap'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * Background export jobs. Image exports run OFFSCREEN (see ExportJobHost) so the
 * workspace stays usable while they render; the ExportJobTracker popup shows
 * each job's progress and offers a download when it finishes. Jobs render
 * sequentially — the host always renders the first job that is queued/rendering.
 */

/** Everything needed to render one image export, snapshotted at enqueue time so
 *  later edits to the workspace flame don't affect an in-flight job. */
export type ImageJobSpec = {
  name: string
  flame: FlameDescriptor
  quality: number
  dimensions: { width: number; height: number }
  palette: Palette | undefined
  blendFlame: FlameDescriptor | undefined
  blendWeight: number
  embedFlame: boolean
  embedAnimation: boolean
  condenseHidden: boolean
  tracks: TimelineTrack[]
  config: TimelineConfig
}

export type ExportJobStatus = 'queued' | 'rendering' | 'done' | 'error'

export type ExportJob = ImageJobSpec & {
  id: string
  type: 'image'
  status: ExportJobStatus
  progress: { current: number; target: number }
  startedAt: number
  /** Set via requestJobForceExport — capture at the current quality ("Stop &
   *  Export"). */
  forceExport: boolean
  result?: { blobUrl: string; width: number; height: number }
  /** Set once the user has downloaded the finished result — drives the
   *  before-unload "you have undownloaded exports" guard. */
  downloaded?: boolean
  error?: string
}

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

export function setJobStatus(id: string, status: ExportJobStatus) {
  setStore('items', (j) => j.id === id, 'status', status)
}

export function setJobProgress(id: string, current: number, target: number) {
  setStore('items', (j) => j.id === id, 'progress', { current, target })
}

export function setJobResult(
  id: string,
  result: { blobUrl: string; width: number; height: number },
) {
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
