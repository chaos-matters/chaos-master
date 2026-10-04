/**
 * Reference-orbit worker: BigInt iteration plus BLA construction, off the
 * main thread. Raw orbits are cached under everything they depend on (the
 * start, c, the bits and the iteration limit), so an orbit asked for again
 * costs a table build instead of a full iteration. That is what keeps a
 * Julia pan cheap: its critical orbit depends on c alone. A zoom-out never
 * hits, since the explorer asks for the new view's centre at the new view's
 * precision, and both are part of the key.
 */
import { BAILOUT, buildBla, iterateOrbit, packOrbit } from '@chaos-master/core'
import { createOrbitCache } from './orbitCache'
import type { ComplexString, ReferenceOrbit } from '@chaos-master/core'
import type { GpuOrbit, OrbitCommand, OrbitRequest, OrbitResponse, } from './orbitProtocol'

interface WorkerScope {
  postMessage(message: OrbitResponse, transfer?: Transferable[]): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<OrbitCommand>) => void,
  ): void
}

const scope = globalThis as unknown as WorkerScope
const { performance } = globalThis

/** The one request still wanted; 0, which no request has, after a cancel. */
let latestId = 0
const cache = createOrbitCache({ orbits: 4, bytes: 128 * 1024 * 1024 })

function orbitKey(
  request: OrbitRequest,
  start: ComplexString,
  c: ComplexString,
): string {
  return [
    start.re,
    start.im,
    c.re,
    c.im,
    request.bits,
    request.maxIterations,
  ].join('|')
}

/** Let queued messages in, so a newer request can supersede this one. */
function yieldToMessages(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      resolve()
    }
    channel.port2.postMessage(null)
  })
}

class Superseded extends Error {}

async function orbitFor(
  request: OrbitRequest,
  start: ComplexString,
  c: ComplexString,
  inUse: readonly string[],
  progress: (fraction: number) => void,
): Promise<ReferenceOrbit> {
  const key = orbitKey(request, start, c)
  const hit = cache.get(key)
  if (hit) return hit
  const run = iterateOrbit({
    startRe: start.re,
    startIm: start.im,
    cRe: c.re,
    cIm: c.im,
    bits: request.bits,
    maxIterations: request.maxIterations,
    escapeRadius: BAILOUT,
  })
  let lastPost = performance.now()
  for (;;) {
    const step = run.next()
    if (step.done) {
      cache.remember(key, step.value, inUse)
      return step.value
    }
    const now = performance.now()
    if (now - lastPost > 50) {
      lastPost = now
      progress(step.value / (request.maxIterations + 1))
      await yieldToMessages()
      if (latestId !== request.id) throw new Superseded()
    }
  }
}

function pack(
  orbit: ReferenceOrbit,
  hasDc: boolean,
  start: number,
  cMaxLog2: number,
): GpuOrbit {
  const bla = buildBla(orbit, { hasDc, start, cMaxLog2 })
  return {
    data: packOrbit(orbit),
    length: orbit.length,
    escaped: orbit.escaped,
    bla: {
      data: bla.data,
      levels: bla.levels,
      minLevel: bla.minLevel,
      start: bla.start,
      entryCount: bla.entryCount,
    },
  }
}

async function handle(request: OrbitRequest): Promise<void> {
  const t0 = performance.now()
  const zero = { re: '0', im: '0' }
  const julia = request.kind === 'julia'
  // A Mandelbrot orbit starts at 0 with the reference as c. A Julia one
  // starts at the reference, and its critical orbit at 0, both with juliaC.
  const start = julia ? request.reference : zero
  const c = julia ? request.juliaC : request.reference
  const progress = (fraction: number) => {
    scope.postMessage({
      type: 'progress',
      id: request.id,
      fraction: julia ? fraction / 2 : fraction,
    })
  }
  // Everything that can throw stays in here: a rejected `handle` would
  // stop the queue, and no later request would ever be answered.
  try {
    // Neither orbit may push the other out of the cache to make room.
    const inUse = [orbitKey(request, start, c)]
    if (julia) inUse.push(orbitKey(request, zero, c))
    const main = await orbitFor(request, start, c, inUse, progress)
    const critical = julia
      ? await orbitFor(request, zero, c, inUse, (f) => {
          progress(1 + f)
        })
      : undefined
    const set = {
      main: pack(main, !julia, julia ? 0 : 1, request.cMaxLog2),
      critical: critical && pack(critical, false, 1, request.cMaxLog2),
    }
    const transfer = [set.main.data, set.main.bla.data]
    if (set.critical) transfer.push(set.critical.data, set.critical.bla.data)
    scope.postMessage(
      { type: 'done', id: request.id, set, ms: performance.now() - t0 },
      transfer,
    )
  } catch (error) {
    if (error instanceof Superseded) {
      scope.postMessage({ type: 'superseded', id: request.id })
    } else {
      scope.postMessage({
        type: 'error',
        id: request.id,
        message: String(error),
      })
    }
  }
}

let queue: Promise<void> = Promise.resolve()

scope.addEventListener('message', (event) => {
  const request = event.data
  if (request.type === 'cancel') {
    // Whatever runs or waits is now superseded, and stops at its next slice.
    latestId = 0
    return
  }
  latestId = request.id
  queue = queue.then(async () => {
    if (latestId === request.id) await handle(request)
    else scope.postMessage({ type: 'superseded', id: request.id })
  })
})
