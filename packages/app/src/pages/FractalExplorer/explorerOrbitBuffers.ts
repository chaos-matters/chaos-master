/**
 * The reference orbits on the GPU: both orbits of a set back to back in one
 * storage buffer, their BLA tables in a second, and the per-level offsets
 * in a third.
 *
 * A buffer an upload outgrows is replaced by one half again as large, so a
 * deepening zoom does not reallocate for every new reference, but never
 * past what one storage binding holds: a larger buffer would fail every
 * bind group it is put in, for good. An upload the device refuses resets
 * the capacity, so the next one allocates afresh instead of trusting the
 * buffer that was refused.
 *
 * `deviceErrors` wraps GPU work in the out-of-memory and validation scopes,
 * for the uploads here and for `explorerGpu`'s steps.
 */
import { BLA_ENTRY_BYTES, ORBIT_ENTRY_BYTES } from '@chaos-master/core'
import { arrayOf, vec2u } from 'typegpu/data'
import { BlaEntry, OrbitEntry } from './explorerShaders'
import { layoutOrbitUpload, MAX_BLA_LEVELS } from './orbitUpload'
import type { TgpuRoot } from 'typegpu'
import type { GpuOrbitSet } from './orbitProtocol'
import type { OrbitUpload } from './orbitUpload'

const { ceil, floor, max, min } = Math

/** The most entries of `bytes` each that one storage binding can hold. */
export function bindingEntries(
  limits: Pick<
    GPUSupportedLimits,
    'maxStorageBufferBindingSize' | 'maxBufferSize'
  >,
  bytes: number,
): number {
  const { maxStorageBufferBindingSize, maxBufferSize } = limits
  return floor(min(maxStorageBufferBindingSize, maxBufferSize) / bytes)
}

/**
 * The capacity to allocate for `needed` entries: half again the old one,
 * for room to grow, but never past `limit` unless `needed` itself is.
 */
export function grownCapacity(
  needed: number,
  capacity: number,
  limit: number,
): number {
  return max(needed, min(limit, ceil(capacity * 1.5)))
}

/**
 * The capacity for `needed` entries when the need can shrink too, as a
 * pixel grid's does: the current one while it holds `needed` without being
 * over twice that, or else `needed` and a quarter, within `limit`.
 */
export function fittedCapacity(
  needed: number,
  capacity: number,
  limit: number,
): number {
  if (needed <= capacity && capacity <= 2 * needed) return capacity
  return max(needed, min(limit, ceil(needed * 1.25)))
}

async function popBoth(device: GPUDevice): Promise<string | undefined> {
  const invalid = device.popErrorScope()
  const memory = device.popErrorScope()
  const failure = (await invalid) ?? (await memory)
  return failure?.message
}

/**
 * Run `work` inside out-of-memory and validation error scopes and resolve
 * to the device's complaint about it, if it had one. The scopes are popped
 * even when `work` throws, so one failure cannot leave the stack unbalanced
 * and pin a later error on the wrong call.
 */
export function deviceErrors(
  device: GPUDevice,
  work: () => void,
): Promise<string | undefined> {
  device.pushErrorScope('out-of-memory')
  device.pushErrorScope('validation')
  try {
    work()
  } catch (cause) {
    popBoth(device).catch(() => undefined)
    throw cause
  }
  return popBoth(device)
}

function emptyInfo(): OrbitUpload['info'] {
  const none = {
    base: 0,
    length: 1,
    blaStart: 0,
    levelBase: 0,
    levelCount: 0,
    minLevel: 0,
  }
  return { orbit0: none, orbit1: none }
}

export type OrbitBuffers = ReturnType<typeof createOrbitBuffers>

export function createOrbitBuffers(root: TgpuRoot) {
  const { device } = root
  const blaLevels = root
    .createBuffer(arrayOf(vec2u, 2 * MAX_BLA_LEVELS))
    .$usage('storage')
  let orbitCapacity = 0
  let orbits = root.createBuffer(arrayOf(OrbitEntry, 1)).$usage('storage')
  let blaCapacity = 0
  let bla = root.createBuffer(arrayOf(BlaEntry, 1)).$usage('storage')
  let info = emptyInfo()
  let loaded = false
  let uploads = 0

  /** The most orbit entries, both orbits together, one binding can hold. */
  function maxOrbitEntries(): number {
    return bindingEntries(device.limits, ORBIT_ENTRY_BYTES)
  }

  function write(upload: OrbitUpload) {
    if (upload.orbitEntries > orbitCapacity) {
      orbits.destroy()
      orbitCapacity = grownCapacity(
        upload.orbitEntries,
        orbitCapacity,
        maxOrbitEntries(),
      )
      orbits = root
        .createBuffer(arrayOf(OrbitEntry, orbitCapacity))
        .$usage('storage')
    }
    if (upload.blaEntries > blaCapacity) {
      bla.destroy()
      blaCapacity = grownCapacity(
        upload.blaEntries,
        blaCapacity,
        bindingEntries(device.limits, BLA_ENTRY_BYTES),
      )
      bla = root.createBuffer(arrayOf(BlaEntry, blaCapacity)).$usage('storage')
    }
    const { queue } = device
    for (const { orbit, orbitBase, blaBase } of upload.writes) {
      const orbitOffset = orbitBase * ORBIT_ENTRY_BYTES
      queue.writeBuffer(root.unwrap(orbits), orbitOffset, orbit.data)
      if (orbit.bla.entryCount > 0) {
        const blaOffset = blaBase * BLA_ENTRY_BYTES
        queue.writeBuffer(root.unwrap(bla), blaOffset, orbit.bla.data)
      }
    }
    queue.writeBuffer(root.unwrap(blaLevels), 0, upload.levels)
    info = upload.info
    loaded = true
  }

  /**
   * Upload a worker's orbits, concatenated, with level offsets rebased, and
   * call `rebind` for the buffers that may have replaced the old ones, in
   * the same error scopes. Resolves to the device's complaint, if it had one.
   */
  async function upload(
    set: GpuOrbitSet,
    rebind: () => void,
  ): Promise<string | undefined> {
    const layout = layoutOrbitUpload(set)
    const generation = (uploads += 1)
    const failure = await deviceErrors(device, () => {
      write(layout)
      rebind()
    })
    if (failure !== undefined) {
      orbitCapacity = 0
      blaCapacity = 0
      // Nothing iterates against the refused buffers, unless a later
      // upload has replaced them already.
      if (generation === uploads) loaded = false
    }
    return failure
  }

  return {
    maxOrbitEntries,
    upload,
    /** Bindings for the iterate pass; they change when a buffer grows. */
    bindings: () => ({ orbits, bla, blaLevels }),
    info: () => info,
    loaded: () => loaded,
    destroy() {
      for (const b of [blaLevels, orbits, bla]) b.destroy()
    },
  }
}
