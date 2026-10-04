/**
 * Lays a worker's orbit set out for upload. Both orbits (a Julia view has
 * two) share one orbit buffer and one BLA buffer, back to back, so each
 * orbit's BLA level offsets are rebased onto where its table lands.
 */
import type { GpuOrbit, GpuOrbitSet } from './orbitProtocol'

export const MAX_BLA_LEVELS = 64

/** One orbit's place in the shared buffers, as `OrbitInfo` in the shader. */
export interface OrbitSlot {
  readonly base: number
  readonly length: number
  readonly blaStart: number
  readonly levelBase: number
  readonly levelCount: number
  readonly minLevel: number
}

export interface OrbitUpload {
  /** Entries each shared buffer must hold. */
  readonly orbitEntries: number
  readonly blaEntries: number
  /** Where each orbit's data goes, in entries. */
  readonly writes: readonly {
    orbit: GpuOrbit
    orbitBase: number
    blaBase: number
  }[]
  /** (first entry, count) per level, both orbits: the `blaLevels` buffer. */
  readonly levels: Uint32Array<ArrayBuffer>
  readonly info: { readonly orbit0: OrbitSlot; readonly orbit1: OrbitSlot }
}

export function layoutOrbitUpload(set: GpuOrbitSet): OrbitUpload {
  const list = set.critical ? [set.main, set.critical] : [set.main]
  const levels = new Uint32Array(4 * MAX_BLA_LEVELS)
  const writes: { orbit: GpuOrbit; orbitBase: number; blaBase: number }[] = []
  const slots: OrbitSlot[] = []
  let orbitBase = 0
  let blaBase = 0
  let levelBase = 0
  for (const orbit of list) {
    writes.push({ orbit, orbitBase, blaBase })
    const count = Math.min(orbit.bla.levels.length, MAX_BLA_LEVELS)
    for (let j = 0; j < count; j += 1) {
      const level = orbit.bla.levels[j]!
      levels[2 * (levelBase + j)] = blaBase + level.offset
      levels[2 * (levelBase + j) + 1] = level.count
    }
    slots.push({
      base: orbitBase,
      length: orbit.length,
      blaStart: orbit.bla.start,
      levelBase,
      levelCount: count,
      minLevel: orbit.bla.minLevel,
    })
    orbitBase += orbit.length
    // An orbit with no table still takes an entry: a buffer is never empty.
    blaBase += Math.max(1, orbit.bla.entryCount)
    levelBase += count
  }
  return {
    orbitEntries: orbitBase,
    blaEntries: blaBase,
    writes,
    levels,
    info: { orbit0: slots[0]!, orbit1: slots[1] ?? slots[0]! },
  }
}
