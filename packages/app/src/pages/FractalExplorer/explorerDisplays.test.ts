/**
 * The display buffers, over a fake root that records every buffer it makes:
 * which one a restart promotes to backdrop, which it reuses, which it frees,
 * and that nothing is left behind.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDisplays } from './explorerDisplays'
import type { TgpuRoot } from 'typegpu'

interface FakeBuffer {
  readonly pixels: number
  destroyed: number
  $usage: () => FakeBuffer
  destroy: () => void
}

/** A root whose buffers only know their length and how often they died. */
function fakeRoot() {
  const made: FakeBuffer[] = []
  const root = {
    createBuffer(schema: { elementCount: number }) {
      const buffer: FakeBuffer = {
        pixels: schema.elementCount,
        destroyed: 0,
        $usage: () => buffer,
        destroy: () => {
          buffer.destroyed += 1
        },
      }
      made.push(buffer)
      return buffer
    },
  }
  return { root: root as unknown as TgpuRoot, made }
}

const SMALL = { width: 4, height: 3 }
const LARGE = { width: 8, height: 6 }

function setup() {
  const { root, made } = fakeRoot()
  const displays = createDisplays(root)
  const display = () => displays.display()?.buffer as unknown
  const backdrop = () => displays.backdrop()?.buffer as unknown
  /** Start a picture and colour it, as a restart and one step would. */
  const drawAt = (size: typeof SMALL) => {
    displays.begin(size)
    displays.markDrawn()
  }
  return { displays, made, display, backdrop, drawAt }
}

describe('createDisplays begin', () => {
  it('makes a display the size of the grid, with no backdrop yet', () => {
    const { displays, made, backdrop } = setup()
    displays.begin(SMALL)
    expect(made.map((b) => b.pixels)).toEqual([12])
    expect(displays.display()?.size).toEqual(SMALL)
    expect(backdrop()).toBeUndefined()
    expect(displays.drawn()).toBe(false)
  })

  it('promotes a drawn display to backdrop, and starts a fresh one', () => {
    const { displays, made, display, backdrop, drawAt } = setup()
    drawAt(SMALL)
    expect(displays.drawn()).toBe(true)
    const first = display()
    displays.begin(SMALL)
    expect(backdrop()).toBe(first)
    expect(display()).not.toBe(first)
    expect(made).toHaveLength(2)
    expect(displays.drawn()).toBe(false)
  })

  it('reuses an undrawn display of the same size, keeping the backdrop', () => {
    const { displays, made, display, backdrop, drawAt } = setup()
    drawAt(SMALL)
    displays.begin(SMALL)
    const shown = display()
    const behind = backdrop()
    // Two restarts with no frame between: nothing new was drawn.
    displays.begin(SMALL)
    expect(display()).toBe(shown)
    expect(backdrop()).toBe(behind)
    expect(made).toHaveLength(2)
    expect(made.every((b) => b.destroyed === 0)).toBe(true)
  })

  it('replaces an undrawn display when the grid changes size', () => {
    const { displays, made, display, backdrop, drawAt } = setup()
    drawAt(SMALL)
    displays.begin(SMALL)
    const undrawn = made[1]!
    const behind = backdrop()
    displays.begin(LARGE)
    expect(undrawn.destroyed).toBe(1)
    expect(displays.display()?.size).toEqual(LARGE)
    expect((display() as FakeBuffer).pixels).toBe(48)
    // The backdrop is still the last picture drawn, whatever its size.
    expect(backdrop()).toBe(behind)
  })

  it('reuses the retired backdrop as the next display when it fits', () => {
    const { displays, made, display, backdrop, drawAt } = setup()
    drawAt(SMALL)
    const first = display()
    drawAt(SMALL)
    const second = display()
    displays.begin(SMALL)
    // The first display went display, backdrop, retired, and is back.
    expect(backdrop()).toBe(second)
    expect(display()).toBe(first)
    expect(made).toHaveLength(2)
    expect(made.every((b) => b.destroyed === 0)).toBe(true)
  })

  it('frees the retired backdrop instead when the size changed', () => {
    const { displays, made, display, backdrop, drawAt } = setup()
    drawAt(SMALL)
    drawAt(SMALL)
    const second = display()
    displays.begin(LARGE)
    expect(made[0]!.destroyed).toBe(1)
    expect(backdrop()).toBe(second)
    expect((display() as FakeBuffer).pixels).toBe(48)
    expect(made).toHaveLength(3)
  })
})

describe('createDisplays destroy', () => {
  it('frees every live buffer once, and leaks none, after any run of restarts', () => {
    const { displays, made, drawAt } = setup()
    drawAt(SMALL)
    drawAt(SMALL)
    drawAt(LARGE)
    displays.begin(LARGE)
    drawAt(LARGE)
    drawAt(LARGE)
    displays.destroy()
    expect(made.map((b) => b.destroyed)).toEqual(made.map(() => 1))
  })

  it('frees the display and the backdrop', () => {
    const { displays, display, backdrop, drawAt } = setup()
    drawAt(SMALL)
    displays.begin(SMALL)
    const shown = display() as FakeBuffer
    const behind = backdrop() as FakeBuffer
    displays.destroy()
    expect([shown.destroyed, behind.destroyed]).toEqual([1, 1])
  })

  it('is safe before any picture', () => {
    const { displays } = setup()
    expect(() => {
      displays.destroy()
    }).not.toThrow()
  })
})

describe('createDisplays read', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads nothing before a picture, then the display as RGBA bytes', async () => {
    vi.stubGlobal('GPUBufferUsage', { MAP_READ: 1, COPY_DST: 8 })
    vi.stubGlobal('GPUMapMode', { READ: 1 })
    const copies: unknown[][] = []
    const target = {
      mapAsync: vi.fn(() => Promise.resolve()),
      getMappedRange: () => new Uint8Array([1, 2, 3, 4]).buffer,
      unmap: vi.fn(),
      destroy: vi.fn(),
    }
    const device = {
      createBuffer: vi.fn(() => target),
      createCommandEncoder: () => ({
        copyBufferToBuffer: (...args: unknown[]) => copies.push(args),
        finish: () => 'commands',
      }),
      queue: { submit: vi.fn() },
    }
    const { root: base } = fakeRoot()
    const root = Object.assign(base, {
      device,
      unwrap: (buffer: unknown) => ({ unwrapped: buffer }),
    })
    const displays = createDisplays(root)
    await expect(displays.read()).resolves.toBeUndefined()

    displays.begin({ width: 1, height: 1 })
    const result = await displays.read()
    expect(Array.from(result!.data)).toEqual([1, 2, 3, 4])
    expect(result!.size).toEqual({ width: 1, height: 1 })
    expect(device.createBuffer).toHaveBeenCalledWith({ size: 4, usage: 9 })
    expect(copies).toEqual([
      [{ unwrapped: displays.display()!.buffer }, 0, target, 0, 4],
    ])
    expect(device.queue.submit).toHaveBeenCalledWith(['commands'])
    expect(target.unmap).toHaveBeenCalledOnce()
    expect(target.destroy).toHaveBeenCalledOnce()
  })
})
