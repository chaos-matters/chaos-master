/**
 * The orbit worker, run in this thread: its global `addEventListener` and
 * `postMessage` are stubbed, and every test imports a fresh copy, so the
 * supersede state and the orbit cache start empty each time. Counting the
 * calls to `iterateOrbit` tells a cache hit from a full iteration.
 */
import { BAILOUT, computeOrbit } from '@chaos-master/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Core from '@chaos-master/core'
import type * as Cache from './orbitCache'
import type { OrbitCommand, OrbitRequest, OrbitResponse } from './orbitProtocol'

const iterations = vi.hoisted(() => ({ runs: 0 }))
/** A byte cap for the next worker's cache, in place of its own. */
const cacheCap = vi.hoisted(() => ({ bytes: undefined as number | undefined }))

vi.mock('./orbitCache', async (importOriginal) => {
  const cache = await importOriginal<typeof Cache>()
  return {
    ...cache,
    createOrbitCache: (limits: Cache.OrbitCacheLimits) =>
      cache.createOrbitCache({
        ...limits,
        bytes: cacheCap.bytes ?? limits.bytes,
      }),
  }
})

vi.mock('@chaos-master/core', async (importOriginal) => {
  const core = await importOriginal<typeof Core>()
  return {
    ...core,
    iterateOrbit: (spec: Core.OrbitSpec) => {
      iterations.runs += 1
      return core.iterateOrbit(spec)
    },
  }
})

interface Posted {
  readonly message: OrbitResponse
  readonly transfer: readonly Transferable[]
}

const MANDELBROT = {
  kind: 'mandelbrot',
  reference: { re: '-0.75', im: '0.1' },
  juliaC: { re: '-0.8', im: '0.156' },
  bits: 80,
  maxIterations: 1000,
  cMaxLog2: -10,
} as const satisfies Omit<OrbitRequest, 'id'>

const JULIA = {
  ...MANDELBROT,
  kind: 'julia',
  reference: { re: '0.1', im: '0.2' },
} as const satisfies Omit<OrbitRequest, 'id'>

/** c = 0 never escapes, so this runs all 4M iterations: seconds of work. */
const SLOW = {
  ...MANDELBROT,
  reference: { re: '0', im: '0' },
  bits: 64,
  maxIterations: 4_000_000,
} as const satisfies Omit<OrbitRequest, 'id'>

async function loadWorker() {
  let listener: ((event: MessageEvent) => void) | undefined
  const posted: Posted[] = []
  vi.stubGlobal(
    'addEventListener',
    (type: string, handler: (event: MessageEvent) => void) => {
      if (type === 'message') listener = handler
    },
  )
  vi.stubGlobal(
    'postMessage',
    (message: OrbitResponse, transfer: Transferable[] = []) => {
      posted.push({ message, transfer })
    },
  )
  await import('./orbitWorker')
  if (!listener) throw new Error('the worker listens for no messages')
  const handler = listener
  const send = (command: OrbitCommand) => {
    handler(new MessageEvent('message', { data: command }))
  }
  return {
    posted,
    send,
    request(id: number, request: Omit<OrbitRequest, 'id'>) {
      send({ ...request, type: 'request', id })
    },
    /** Every answer but progress, in the order they were posted. */
    answers() {
      return posted.filter((p) => p.message.type !== 'progress')
    },
    answer(id: number) {
      return posted.find(
        (p) => p.message.id === id && p.message.type !== 'progress',
      )
    },
  }
}

type LoadedWorker = Awaited<ReturnType<typeof loadWorker>>

async function doneSet(worker: LoadedWorker, id: number) {
  await vi.waitFor(() => {
    expect(worker.answer(id)).toBeDefined()
  })
  const { message, transfer } = worker.answer(id)!
  if (message.type !== 'done') throw new Error(`answered ${message.type}`)
  return { set: message.set, transfer }
}

function progressed(worker: LoadedWorker, id: number): Promise<void> {
  return vi.waitFor(() => {
    expect(
      worker.posted.some(
        (p) => p.message.type === 'progress' && p.message.id === id,
      ),
    ).toBe(true)
  })
}

beforeEach(() => {
  vi.resetModules()
  iterations.runs = 0
  cacheCap.bytes = undefined
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('orbitWorker', () => {
  it('answers a Mandelbrot request with the orbit of its reference', async () => {
    const worker = await loadWorker()
    worker.request(1, MANDELBROT)
    const { set, transfer } = await doneSet(worker, 1)
    const expected = computeOrbit({
      startRe: '0',
      startIm: '0',
      cRe: MANDELBROT.reference.re,
      cIm: MANDELBROT.reference.im,
      bits: MANDELBROT.bits,
      maxIterations: MANDELBROT.maxIterations,
      escapeRadius: BAILOUT,
    })
    expect(set.main.length).toBe(expected.length)
    expect(set.main.escaped).toBe(expected.escaped)
    expect(set.main.data.byteLength).toBe(16 * expected.length)
    expect(set.main.bla.start).toBe(1)
    expect(set.critical).toBeUndefined()
    expect(transfer).toEqual([set.main.data, set.main.bla.data])
    expect(transfer[0]).toBe(set.main.data)
    expect(transfer[1]).toBe(set.main.bla.data)
  })

  it('answers a Julia request with its view orbit and the critical orbit of c', async () => {
    const worker = await loadWorker()
    worker.request(1, JULIA)
    const { set, transfer } = await doneSet(worker, 1)
    const spec = {
      cRe: JULIA.juliaC.re,
      cIm: JULIA.juliaC.im,
      bits: JULIA.bits,
      maxIterations: JULIA.maxIterations,
      escapeRadius: BAILOUT,
    }
    const main = computeOrbit({
      ...spec,
      startRe: JULIA.reference.re,
      startIm: JULIA.reference.im,
    })
    const critical = computeOrbit({ ...spec, startRe: '0', startIm: '0' })
    // Distinct lengths, so the two orbits cannot have been swapped.
    expect(main.length).not.toBe(critical.length)
    expect(set.main.length).toBe(main.length)
    expect(set.main.escaped).toBe(main.escaped)
    expect(set.critical?.length).toBe(critical.length)
    expect(set.critical?.escaped).toBe(critical.escaped)
    // A Julia pixel starts on the orbit; its critical orbit starts one in.
    expect(set.main.bla.start).toBe(0)
    expect(set.critical?.bla.start).toBe(1)
    expect(transfer).toHaveLength(4)
  })

  it('supersedes a queued request with the one sent after it', async () => {
    const worker = await loadWorker()
    worker.request(1, SLOW)
    worker.request(2, MANDELBROT)
    await doneSet(worker, 2)
    expect(worker.answers().map((p) => p.message.type)).toEqual([
      'superseded',
      'done',
    ])
    expect(worker.answers()[0]?.message.id).toBe(1)
    // The slow orbit never started.
    expect(iterations.runs).toBe(1)
  })

  it('stops a request in flight at its next yield when a newer one arrives', async () => {
    const worker = await loadWorker()
    worker.request(1, SLOW)
    await progressed(worker, 1)
    worker.request(2, MANDELBROT)
    await doneSet(worker, 2)
    expect(worker.answers().map((p) => [p.message.type, p.message.id])).toEqual(
      [
        ['superseded', 1],
        ['done', 2],
      ],
    )
  })

  it('answers a request it cannot read with an error, and runs the next', async () => {
    const worker = await loadWorker()
    // Short of every field a request needs but these.
    const unreadable = { type: 'request', kind: 'mandelbrot', id: 1 }
    worker.send(unreadable as unknown as OrbitCommand)
    await vi.waitFor(() => {
      expect(worker.answer(1)).toBeDefined()
    })
    expect(worker.answer(1)?.message).toEqual({
      type: 'error',
      id: 1,
      message: expect.stringMatching(/^TypeError: /) as string,
    })
    worker.request(2, MANDELBROT)
    await doneSet(worker, 2)
  })

  it('stops a request in flight at its next yield when it is cancelled', async () => {
    const worker = await loadWorker()
    worker.request(1, SLOW)
    await progressed(worker, 1)
    worker.send({ type: 'cancel' })
    await vi.waitFor(() => {
      expect(worker.answer(1)).toBeDefined()
    })
    // A request after the cancel is answered as usual.
    worker.request(2, MANDELBROT)
    await doneSet(worker, 2)
    expect(worker.answers().map((p) => [p.message.type, p.message.id])).toEqual(
      [
        ['superseded', 1],
        ['done', 2],
      ],
    )
  })

  it('never starts a queued request that was cancelled', async () => {
    const worker = await loadWorker()
    worker.request(1, SLOW)
    worker.send({ type: 'cancel' })
    await vi.waitFor(() => {
      expect(worker.answer(1)).toBeDefined()
    })
    // Give a cancel mistaken for a request the time to be answered.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(worker.answers().map((p) => [p.message.type, p.message.id])).toEqual(
      [['superseded', 1]],
    )
    expect(iterations.runs).toBe(0)
  })

  it('reports a Julia request in halves: the view orbit, then the critical one', async () => {
    const worker = await loadWorker()
    const still = {
      ...SLOW,
      kind: 'julia',
      juliaC: { re: '0', im: '0' },
    } as const satisfies Omit<OrbitRequest, 'id'>
    // From 0.5 under c = 0 the view orbit never escapes: it is the slow one.
    worker.request(1, { ...still, reference: { re: '0.5', im: '0' } })
    await progressed(worker, 1)
    // From 10 it escapes at once, and the critical orbit is the slow one.
    worker.request(2, { ...still, reference: { re: '10', im: '0' } })
    await progressed(worker, 2)
    worker.send({ type: 'cancel' })
    await vi.waitFor(() => {
      expect(worker.answer(2)?.message.type).toBe('superseded')
    })
    const fractions = (id: number) =>
      worker.posted.flatMap((p) =>
        p.message.type === 'progress' && p.message.id === id
          ? [p.message.fraction]
          : [],
      )
    expect(Math.min(...fractions(1))).toBeGreaterThan(0)
    expect(Math.max(...fractions(1))).toBeLessThan(0.5)
    expect(Math.min(...fractions(2))).toBeGreaterThan(0.5)
    expect(Math.max(...fractions(2))).toBeLessThan(1)
  })

  it('iterates the same request only once', async () => {
    const worker = await loadWorker()
    worker.request(1, MANDELBROT)
    const first = await doneSet(worker, 1)
    worker.request(2, MANDELBROT)
    const second = await doneSet(worker, 2)
    expect(iterations.runs).toBe(1)
    expect(second.set.main.length).toBe(first.set.main.length)
    // Each answer transfers buffers of its own, so the cache survives.
    expect(second.set.main.data).not.toBe(first.set.main.data)
    expect(new Uint8Array(second.set.main.data)).toEqual(
      new Uint8Array(first.set.main.data),
    )
  })

  it('keeps the critical orbit across a Julia pan', async () => {
    const worker = await loadWorker()
    worker.request(1, JULIA)
    await doneSet(worker, 1)
    expect(iterations.runs).toBe(2)
    worker.request(2, { ...JULIA, reference: { re: '0.1', im: '0.21' } })
    await doneSet(worker, 2)
    expect(iterations.runs).toBe(3)
  })

  it('keeps the critical orbit across a Julia pan when its two orbits are over the cap', async () => {
    // With c = 0 neither orbit escapes, so each is 1001 entries of 20 B, and
    // the cap has room for one: the case of two 4M orbits against 128 MiB.
    cacheCap.bytes = 30_000
    const worker = await loadWorker()
    const still = { ...JULIA, juliaC: { re: '0', im: '0' } }
    worker.request(1, { ...still, reference: { re: '0.5', im: '0' } })
    const { set } = await doneSet(worker, 1)
    expect([set.main.length, set.critical?.length]).toEqual([1001, 1001])
    worker.request(2, { ...still, reference: { re: '0.5', im: '0.01' } })
    await doneSet(worker, 2)
    expect(iterations.runs).toBe(3)
  })
})
