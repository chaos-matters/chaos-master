/**
 * The orbit client against a stand-in worker: which answer settles which
 * request, what a newer request does to an older one, and what the caller
 * sees when the worker fails or the client is disposed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOrbitClient } from './orbitClient'
import type { GpuOrbitSet, OrbitRequest, OrbitResponse } from './orbitProtocol'

/** Keeps what the client posts; a test answers through `reply`. */
class FakeWorker extends EventTarget {
  readonly posted: unknown[] = []
  terminated = 0
  postMessage(message: unknown) {
    this.posted.push(message)
  }
  terminate() {
    this.terminated += 1
  }
  reply(message: OrbitResponse) {
    this.dispatchEvent(new MessageEvent('message', { data: message }))
  }
}

const REQUEST = {
  kind: 'mandelbrot',
  reference: { re: '-0.75', im: '0.1' },
  juliaC: { re: '-0.8', im: '0.156' },
  bits: 80,
  maxIterations: 1000,
  cMaxLog2: -10,
} as const satisfies Omit<OrbitRequest, 'id'>

const SET: GpuOrbitSet = {
  main: {
    data: new ArrayBuffer(16),
    length: 1,
    escaped: true,
    bla: {
      data: new ArrayBuffer(0),
      levels: [],
      minLevel: 0,
      start: 1,
      entryCount: 0,
    },
  },
}

function setup() {
  const made: FakeWorker[] = []
  vi.stubGlobal(
    'Worker',
    class extends FakeWorker {
      constructor() {
        super()
        made.push(this)
      }
    },
  )
  const progress = vi.fn()
  const client = createOrbitClient(progress)
  expect(made).toHaveLength(1)
  return { client, worker: made[0]!, progress }
}

/** How a promise has settled after `ms`, or 'pending'. */
function settledWithin<T>(promise: Promise<T>, ms = 20) {
  return Promise.race([
    promise.then(
      (value) => ({ resolved: value }),
      (error: unknown) => ({ rejected: (error as Error).message }),
    ),
    new Promise<'pending'>((resolve) => {
      setTimeout(() => {
        resolve('pending')
      }, ms)
    }),
  ])
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createOrbitClient', () => {
  it('posts each request with the next id', () => {
    const { client, worker } = setup()
    void client.request(REQUEST)
    void client.request({ ...REQUEST, maxIterations: 2000 })
    expect(worker.posted).toMatchObject([
      { ...REQUEST, id: 1 },
      { ...REQUEST, maxIterations: 2000, id: 2 },
    ])
  })

  it('resolves a superseded request as undefined and a finished one with its orbits', async () => {
    const { client, worker } = setup()
    const a = client.request(REQUEST)
    const b = client.request(REQUEST)
    worker.reply({ type: 'superseded', id: 1 })
    worker.reply({ type: 'done', id: 2, set: SET, ms: 12.5 })
    await expect(a).resolves.toBeUndefined()
    await expect(b).resolves.toEqual({ set: SET, ms: 12.5 })
  })

  it('reports progress for the latest request only', () => {
    const { client, worker, progress } = setup()
    void client.request(REQUEST)
    worker.reply({ type: 'progress', id: 1, fraction: 0.25 })
    void client.request(REQUEST)
    worker.reply({ type: 'progress', id: 1, fraction: 0.5 })
    worker.reply({ type: 'progress', id: 2, fraction: 0.75 })
    expect(progress.mock.calls).toEqual([[0.25], [0.75]])
  })

  it('rejects with the text of an error the worker sends', async () => {
    const { client, worker } = setup()
    const a = client.request(REQUEST)
    worker.reply({ type: 'error', id: 1, message: 'RangeError: too deep' })
    await expect(a).rejects.toThrow('RangeError: too deep')
  })

  it('ignores an answer for an id it is not waiting on', async () => {
    const { client, worker } = setup()
    const a = client.request(REQUEST)
    worker.reply({ type: 'done', id: 7, set: SET, ms: 1 })
    worker.reply({ type: 'error', id: 8, message: 'not yours' })
    expect(await settledWithin(a)).toBe('pending')
    worker.reply({ type: 'done', id: 1, set: SET, ms: 3 })
    expect(await settledWithin(a)).toEqual({ resolved: { set: SET, ms: 3 } })
    // Settled once: a second answer for the same id changes nothing.
    worker.reply({ type: 'error', id: 1, message: 'late' })
    expect(await settledWithin(a)).toEqual({ resolved: { set: SET, ms: 3 } })
  })

  it('rejects every pending request with the message of a worker error', async () => {
    const { client, worker } = setup()
    const a = client.request(REQUEST)
    const b = client.request(REQUEST)
    worker.dispatchEvent(new ErrorEvent('error', { message: 'x' }))
    await expect(a).rejects.toThrow('x')
    await expect(b).rejects.toThrow('x')
  })

  it('reports a worker that failed to load, and refuses later requests at once', async () => {
    const { client, worker } = setup()
    const a = client.request(REQUEST)
    // A module worker whose script cannot load (offline, a chunk gone after
    // a deploy, CSP) fires a plain Event with no message, and never runs.
    worker.dispatchEvent(new Event('error'))
    const failed = {
      rejected:
        'the orbit worker failed to start. Reload the page to try again.',
    }
    expect(await settledWithin(a)).toEqual(failed)
    expect(await settledWithin(client.request(REQUEST))).toEqual(failed)
    // Nothing more goes to a worker that will never answer.
    expect(worker.posted).toHaveLength(1)
  })

  it('refuses later requests with the message of the error that stopped the worker', async () => {
    const { client, worker } = setup()
    worker.dispatchEvent(new ErrorEvent('error', { message: 'x' }))
    expect(await settledWithin(client.request(REQUEST))).toEqual({
      rejected: 'x',
    })
    const other = setup()
    other.worker.dispatchEvent(new ErrorEvent('error'))
    expect(await settledWithin(other.client.request(REQUEST))).toEqual({
      rejected:
        'the orbit worker failed to start. Reload the page to try again.',
    })
  })

  it('cancels the request in flight: it resolves as undefined and the worker is told', async () => {
    const { client, worker, progress } = setup()
    const a = client.request(REQUEST)
    client.cancel()
    expect(await settledWithin(a)).toEqual({ resolved: undefined })
    expect(worker.posted).toEqual([
      expect.objectContaining({ id: 1 }),
      { type: 'cancel' },
    ])
    // What the worker still says about it changes nothing.
    worker.reply({ type: 'progress', id: 1, fraction: 0.5 })
    worker.reply({ type: 'superseded', id: 1 })
    expect(progress).not.toHaveBeenCalled()
    // The next request goes out and is answered as usual.
    const b = client.request(REQUEST)
    worker.reply({ type: 'done', id: 2, set: SET, ms: 4 })
    expect(await settledWithin(b)).toEqual({ resolved: { set: SET, ms: 4 } })
  })

  it('tells the worker nothing when there is nothing to cancel', async () => {
    const { client, worker } = setup()
    client.cancel()
    const a = client.request(REQUEST)
    worker.reply({ type: 'done', id: 1, set: SET, ms: 1 })
    await a
    client.cancel()
    expect(worker.posted).toHaveLength(1)
  })

  it('terminates the worker on dispose and resolves what was pending as undefined', async () => {
    const { client, worker } = setup()
    const a = client.request(REQUEST)
    const b = client.request(REQUEST)
    client.dispose()
    expect(worker.terminated).toBe(1)
    await expect(a).resolves.toBeUndefined()
    await expect(b).resolves.toBeUndefined()
  })
})
