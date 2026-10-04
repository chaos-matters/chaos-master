/**
 * Orbit buffers never grow past one storage binding, and the error scopes
 * around GPU work stay balanced when that work throws. Uploads run over a
 * fake root: where each orbit lands, when a buffer is replaced, and what a
 * refused upload leaves behind.
 */
import { describe, expect, it, vi } from 'vitest'
import { bindingEntries, createOrbitBuffers, deviceErrors, fittedCapacity, grownCapacity, } from './explorerOrbitBuffers'
import type { TgpuRoot } from 'typegpu'
import type { GpuOrbit } from './orbitProtocol'

const MIB = 1024 * 1024

describe('grownCapacity', () => {
  it('grows by half again, for room, below the limit', () => {
    expect(grownCapacity(1100, 1000, 10_000)).toBe(1500)
    expect(grownCapacity(2000, 1000, 10_000)).toBe(2000)
  })

  it('stops at the binding limit instead of growing past it', () => {
    const limit = bindingEntries(
      { maxStorageBufferBindingSize: 128 * MIB, maxBufferSize: 256 * MIB },
      16,
    )
    expect(limit).toBe(8 * MIB)
    // 6M entries fit; half again would be 9M, over the 8M a binding holds.
    expect(grownCapacity(6 * MIB + 1, 6 * MIB, limit)).toBe(limit)
  })

  it('allocates exactly what is needed the first time, or past the limit', () => {
    expect(grownCapacity(700, 0, 10_000)).toBe(700)
    expect(grownCapacity(12_000, 9000, 10_000)).toBe(12_000)
  })
})

describe('bindingEntries', () => {
  it('fits the smaller of the binding and buffer limits, in whole entries', () => {
    const limits = { maxStorageBufferBindingSize: 1000, maxBufferSize: 999 }
    expect(bindingEntries(limits, 16)).toBe(62)
    expect(bindingEntries({ ...limits, maxBufferSize: 4000 }, 16)).toBe(62)
    expect(bindingEntries({ ...limits, maxBufferSize: 4000 }, 32)).toBe(31)
  })
})

describe('fittedCapacity', () => {
  it('keeps the buffers while a resized grid still fits them', () => {
    expect(fittedCapacity(900, 1000, 10_000)).toBe(1000)
    expect(fittedCapacity(500, 1000, 10_000)).toBe(1000)
    expect(fittedCapacity(1000, 1000, 10_000)).toBe(1000)
  })

  it('reallocates with a quarter spare to grow, and to give memory back', () => {
    expect(fittedCapacity(1001, 1000, 10_000)).toBe(1252)
    expect(fittedCapacity(499, 1000, 10_000)).toBe(624)
    expect(fittedCapacity(400, 1000, 10_000)).toBe(500)
    expect(fittedCapacity(9000, 1000, 10_000)).toBe(10_000)
    expect(fittedCapacity(20_000, 1000, 10_000)).toBe(20_000)
  })
})

/** A device with only the error-scope stack, counting what is open. */
function scopedDevice(errors: (string | undefined)[] = []) {
  let open = 0
  const device = {
    pushErrorScope() {
      open += 1
    },
    popErrorScope() {
      open -= 1
      const message = errors.shift()
      return Promise.resolve(message === undefined ? null : { message })
    },
  }
  return { device: device as unknown as GPUDevice, open: () => open }
}

describe('deviceErrors', () => {
  it('resolves to the first complaint, with both scopes popped', async () => {
    const { device, open } = scopedDevice(['bad binding'])
    const result = deviceErrors(device, () => undefined)
    expect(open()).toBe(0)
    await expect(result).resolves.toBe('bad binding')
  })

  it('pops both scopes when the work throws, and passes the throw on', () => {
    const { device, open } = scopedDevice()
    expect(() =>
      deviceErrors(device, () => {
        throw new Error('no current texture')
      }),
    ).toThrow('no current texture')
    expect(open()).toBe(0)
  })
})

interface FakeBuffer {
  readonly entries: number
  destroyed: number
  $usage: () => FakeBuffer
  destroy: () => void
}

/** Settles one popped error scope: with a complaint, or clean. */
type Settle = (message?: string) => void

/**
 * A root over a device whose bindings hold `orbitLimit` orbit entries (and
 * half as many BLA entries), recording buffers, writes and error scopes.
 * Every scope settles clean at once unless `byHand`, when `pops` holds each
 * popped scope's settle function, in the order popped.
 */
function fakeRoot(orbitLimit: number, byHand: boolean) {
  const made: FakeBuffer[] = []
  const writes: { buffer: FakeBuffer; offset: number; data: unknown }[] = []
  const pops: Settle[] = []
  let open = 0
  const device = {
    limits: {
      maxStorageBufferBindingSize: orbitLimit * 16,
      maxBufferSize: orbitLimit * 64,
    },
    queue: {
      writeBuffer(buffer: FakeBuffer, offset: number, data: unknown) {
        writes.push({ buffer, offset, data })
      },
    },
    pushErrorScope() {
      open += 1
    },
    popErrorScope() {
      open -= 1
      return new Promise((resolve) => {
        const settle: Settle = (message) => {
          resolve(message === undefined ? null : { message })
        }
        if (byHand) pops.push(settle)
        else settle()
      })
    },
  }
  const root = {
    device,
    createBuffer(schema: { elementCount: number }) {
      const buffer: FakeBuffer = {
        entries: schema.elementCount,
        destroyed: 0,
        $usage: () => buffer,
        destroy: () => {
          buffer.destroyed += 1
        },
      }
      made.push(buffer)
      return buffer
    },
    unwrap: (buffer: FakeBuffer) => buffer,
  }
  return {
    root: root as unknown as TgpuRoot,
    made,
    writes,
    pops,
    open: () => open,
  }
}

/** An orbit of `length` entries whose table has `blaEntries` in one level. */
function orbit(length: number, blaEntries: number, start = 1): GpuOrbit {
  return {
    data: new ArrayBuffer(16 * length),
    length,
    escaped: true,
    bla: {
      data: new ArrayBuffer(32 * blaEntries),
      levels:
        blaEntries > 0 ? [{ offset: 0, count: blaEntries, steps: 8 }] : [],
      minLevel: 3,
      start,
      entryCount: blaEntries,
    },
  }
}

function setup(orbitLimit = 1000, byHand = false) {
  const fake = fakeRoot(orbitLimit, byHand)
  const buffers = createOrbitBuffers(fake.root)
  const current = () =>
    buffers.bindings() as unknown as Record<
      'orbits' | 'bla' | 'blaLevels',
      FakeBuffer
    >
  const none = () => undefined
  return { ...fake, buffers, current, none }
}

describe('createOrbitBuffers upload', () => {
  it('writes both orbits and their tables back to back, then the levels', async () => {
    const { buffers, writes, current } = setup()
    expect(buffers.loaded()).toBe(false)
    expect(buffers.info().orbit0.length).toBe(1)
    const main = orbit(100, 18, 0)
    const critical = orbit(40, 7)
    const rebind = vi.fn()
    await expect(
      buffers.upload({ main, critical }, rebind),
    ).resolves.toBeUndefined()
    const { orbits, bla, blaLevels } = current()
    expect(writes.map((w) => [w.buffer, w.offset, w.data])).toEqual([
      [orbits, 0, main.data],
      [bla, 0, main.bla.data],
      [orbits, 100 * 16, critical.data],
      [bla, 18 * 32, critical.bla.data],
      [blaLevels, 0, expect.any(Uint32Array)],
    ])
    expect(rebind).toHaveBeenCalledOnce()
    expect(buffers.loaded()).toBe(true)
    expect(buffers.info().orbit1).toMatchObject({ base: 100, length: 40 })
  })

  it('writes no table for an orbit that has none', async () => {
    const { buffers, writes, current, none } = setup()
    await buffers.upload({ main: orbit(10, 0) }, none)
    expect(writes.map((w) => w.buffer)).toEqual([
      current().orbits,
      current().blaLevels,
    ])
  })

  it('grows a buffer by half again, and never past one binding', async () => {
    const { buffers, current, none } = setup(1000)
    expect(buffers.maxOrbitEntries()).toBe(1000)
    const sizes: number[] = []
    for (const length of [100, 120, 140, 700, 800, 1000]) {
      await buffers.upload({ main: orbit(length, 1) }, none)
      sizes.push(current().orbits.entries)
    }
    // 140 fits the 150 already there; 800 would grow to 1050, past 1000.
    expect(sizes).toEqual([100, 150, 150, 700, 1000, 1000])
  })

  it('grows the BLA buffer the same way, within its own binding', async () => {
    const { buffers, current, none } = setup(1000)
    // 32-byte entries: 500 of them fit where 1000 orbit entries do.
    for (const entries of [400, 450]) {
      await buffers.upload({ main: orbit(10, entries) }, none)
    }
    expect(current().bla.entries).toBe(500)
  })

  it('frees a buffer it replaces', async () => {
    const { buffers, current, none } = setup()
    await buffers.upload({ main: orbit(100, 1) }, none)
    const small = current().orbits
    await buffers.upload({ main: orbit(200, 1) }, none)
    expect(small.destroyed).toBe(1)
    expect(current().orbits.destroyed).toBe(0)
  })

  it('resets the capacity after a refusal, so the next upload allocates afresh', async () => {
    const { buffers, current, pops, none } = setup(1000, true)
    const settleNext = (message?: string) => {
      // Validation is popped first; its complaint is the one reported.
      pops.shift()!(message)
      pops.shift()!()
    }
    const first = buffers.upload({ main: orbit(100, 1) }, none)
    settleNext()
    await first
    const refused = buffers.upload({ main: orbit(120, 1) }, none)
    settleNext('out of memory')
    await expect(refused).resolves.toBe('out of memory')
    expect(buffers.loaded()).toBe(false)
    const distrusted = current().orbits
    expect(distrusted.entries).toBe(150)
    // 110 fits the refused buffer, but it is not trusted again.
    const next = buffers.upload({ main: orbit(110, 1) }, none)
    settleNext()
    await expect(next).resolves.toBeUndefined()
    expect(distrusted.destroyed).toBe(1)
    expect(current().orbits.entries).toBe(110)
    expect(buffers.loaded()).toBe(true)
  })

  it('unloads for a refusal only when no later upload has replaced it', async () => {
    const { buffers, pops, none } = setup(1000, true)
    const older = buffers.upload({ main: orbit(100, 1) }, none)
    const newer = buffers.upload({ main: orbit(100, 1) }, none)
    const [olderInvalid, olderMemory, newerInvalid, newerMemory] = pops
    olderInvalid!('lost')
    olderMemory!()
    await expect(older).resolves.toBe('lost')
    expect(buffers.loaded()).toBe(true)
    newerInvalid!()
    newerMemory!()
    await expect(newer).resolves.toBeUndefined()
    expect(buffers.loaded()).toBe(true)

    const good = buffers.upload({ main: orbit(100, 1) }, none)
    const latest = buffers.upload({ main: orbit(100, 1) }, none)
    const [goodInvalid, goodMemory, latestInvalid, latestMemory] = pops.slice(4)
    latestInvalid!()
    latestMemory!('out of memory')
    await expect(latest).resolves.toBe('out of memory')
    goodInvalid!()
    goodMemory!()
    await expect(good).resolves.toBeUndefined()
    expect(buffers.loaded()).toBe(false)
  })

  it('pops both scopes and rejects when the rebind throws', async () => {
    const { buffers, open } = setup()
    const upload = buffers.upload({ main: orbit(10, 1) }, () => {
      throw new Error('bind group')
    })
    expect(open()).toBe(0)
    await expect(upload).rejects.toThrow('bind group')
  })

  it('frees the level offsets and the current orbit and BLA buffers', async () => {
    const { buffers, made, current, none } = setup()
    await buffers.upload({ main: orbit(100, 4) }, none)
    const live = Object.values(current())
    buffers.destroy()
    expect(live.map((b) => b.destroyed)).toEqual([1, 1, 1])
    // The two placeholders were freed when the upload replaced them.
    expect(made.map((b) => b.destroyed)).toEqual([1, 1, 1, 1, 1])
  })
})
