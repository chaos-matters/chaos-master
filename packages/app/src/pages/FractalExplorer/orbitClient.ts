/**
 * Main-thread side of the orbit worker: one request in flight at a time
 * from the caller's point of view, each newer one superseding the last.
 */
import type { GpuOrbitSet, OrbitCommand, OrbitRequest, OrbitResponse, } from './orbitProtocol'

export interface OrbitResult {
  readonly set: GpuOrbitSet
  readonly ms: number
}

export interface OrbitClient {
  /**
   * Resolves undefined when a newer request superseded this one, or it was
   * cancelled.
   */
  request(request: Omit<OrbitRequest, 'id'>): Promise<OrbitResult | undefined>
  /** Drop the request in flight, and stop the worker iterating it. */
  cancel(): void
  dispose(): void
}

/** What a worker that could not load says, since its error carries nothing. */
const FAILED_TO_START =
  'the orbit worker failed to start. Reload the page to try again.'

export function createOrbitClient(
  onProgress: (fraction: number) => void,
): OrbitClient {
  const worker = new Worker(new URL('./orbitWorker.ts', import.meta.url), {
    type: 'module',
    name: 'explorer-orbit',
  })
  let nextId = 1
  let latest = 0
  /** Set once the worker has failed; every request after is refused. */
  let failure: string | undefined
  const pending = new Map<
    number,
    {
      resolve: (r: OrbitResult | undefined) => void
      reject: (e: Error) => void
    }
  >()

  worker.addEventListener('message', (event: MessageEvent<OrbitResponse>) => {
    const message = event.data
    if (message.type === 'progress') {
      if (message.id === latest) onProgress(message.fraction)
      return
    }
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    if (message.type === 'done')
      entry.resolve({ set: message.set, ms: message.ms })
    else if (message.type === 'superseded') entry.resolve(undefined)
    else entry.reject(new Error(message.message))
  })
  worker.addEventListener('error', (event: Event) => {
    // A worker whose script cannot load (offline, a chunk gone after a
    // deploy, CSP) fires a plain Event with no message, and will never
    // answer, so anything sent to it after would wait forever.
    const message = event instanceof ErrorEvent ? event.message : ''
    failure = message === '' ? FAILED_TO_START : message
    for (const entry of pending.values()) entry.reject(new Error(failure))
    pending.clear()
  })

  return {
    request(request) {
      if (failure !== undefined) return Promise.reject(new Error(failure))
      const id = nextId
      nextId += 1
      latest = id
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        worker.postMessage({
          ...request,
          type: 'request',
          id,
        } satisfies OrbitCommand)
      })
    },
    cancel() {
      if (pending.size === 0) return
      // Settled as a supersede is, and deaf to what the worker still posts
      // for it: its progress, and the `superseded` it ends with.
      latest = 0
      for (const entry of pending.values()) entry.resolve(undefined)
      pending.clear()
      worker.postMessage({ type: 'cancel' } satisfies OrbitCommand)
    },
    dispose() {
      worker.terminate()
      for (const entry of pending.values()) entry.resolve(undefined)
      pending.clear()
    },
  }
}
