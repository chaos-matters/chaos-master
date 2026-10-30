// The share card's capture keeps the first final frame, not the first blob back.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureFinalFrame } from './captureFinalFrame'
import type { ExportImageType } from '@/flame/exportImageType'

/**
 * A canvas whose PNG takes `encodeMs` to come back, like a real encode: the
 * flame's PNG is several times larger than a blank one and takes longer.
 */
function fakeCanvas(name: string, encodeMs: number): HTMLCanvasElement {
  return {
    toBlob(callback: BlobCallback) {
      setTimeout(() => {
        callback(new Blob([name], { type: 'image/png' }))
      }, encodeMs)
    },
  } as unknown as HTMLCanvasElement
}

function harness(timeoutMs = 20000) {
  let hook: ExportImageType | undefined
  const stop = vi.fn()
  const onTaken = vi.fn()
  const blob = captureFinalFrame({
    setHook: (h) => {
      hook = h
    },
    start: () => {},
    stop,
    onTaken,
    timeoutMs,
  })
  return {
    blob,
    stop,
    onTaken,
    tick: (...args: Parameters<ExportImageType>) => hook?.(...args),
    hooked: () => hook !== undefined,
  }
}

const text = async (b: Blob | null) => (b ? await b.text() : null)

afterEach(() => {
  vi.useRealTimers()
})

describe('captureFinalFrame', () => {
  it('ignores frames that are not final', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.tick(fakeCanvas('accumulating', 1), { finalImageReady: false })
    h.tick(fakeCanvas('final', 1), { finalImageReady: true })
    await vi.runAllTimersAsync()
    expect(await text(await h.blob)).toBe('final')
  })

  // The dev pass of 0.9.13: the renderer kept calling the hook on idle
  // ticks, a later call handed over a blank copy, and its quicker encode
  // came back first and became the share card.
  it('keeps the first final frame even when a later one encodes faster', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.tick(fakeCanvas('flame', 50), { finalImageReady: true })
    h.tick(fakeCanvas('blank', 5), { finalImageReady: true })
    h.tick(fakeCanvas('blank', 5), { finalImageReady: true })
    await vi.runAllTimersAsync()
    expect(await text(await h.blob)).toBe('flame')
    expect(h.onTaken).toHaveBeenCalledTimes(1)
  })

  it('removes the hook and stops the render once the frame is encoded', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.tick(fakeCanvas('flame', 10), { finalImageReady: true })
    expect(h.hooked()).toBe(true)
    await vi.runAllTimersAsync()
    await h.blob
    expect(h.hooked()).toBe(false)
    expect(h.stop).toHaveBeenCalledTimes(1)
  })

  it('gives up with null when no final frame comes in time', async () => {
    vi.useFakeTimers()
    const h = harness(1000)
    h.tick(fakeCanvas('accumulating', 1), { finalImageReady: false })
    await vi.advanceTimersByTimeAsync(1000)
    expect(await h.blob).toBeNull()
    expect(h.hooked()).toBe(false)
    expect(h.stop).toHaveBeenCalledTimes(1)
  })
})
