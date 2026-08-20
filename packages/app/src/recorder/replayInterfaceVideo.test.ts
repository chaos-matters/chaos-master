import { afterEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { captureReplayInterfaceVideo, fitReplayInterfaceVideoDimensions, } from './replayInterfaceVideo'
import { SESSION_FORMAT_VERSION } from './schema'
import type { ReplayInterfaceCaptureRuntime } from './replayInterfaceVideo'
import type { RecordedSession } from './schema'

function makeSession(): RecordedSession {
  return {
    version: SESSION_FORMAT_VERSION,
    app: { version: 'test', flameSchemaVersion: '1.0' },
    createdAt: new Date(0).toISOString(),
    initial: deepClone(examples.example1),
    actions: [
      {
        t: 100,
        id: 'flame.setGamma',
        args: [2.4],
        label: 'Set gamma',
      },
    ],
    unnamedWriteCount: 0,
  }
}

function makeRuntime() {
  const endedListeners = new Set<() => void>()
  const bitmapClose = vi.fn()
  const stop = vi.fn()
  const drawFrame = vi.fn()
  const encodeFrame = vi.fn((bitmap: ImageBitmap) => {
    bitmap.close()
    return Promise.resolve()
  })
  const finalize = vi.fn(() =>
    Promise.resolve({
      blob: new Blob(['captured'], { type: 'video/webm' }),
      mimeType: 'video/webm',
      usedFallback: true,
    }),
  )
  const cancel = vi.fn()
  const createEncoder = vi.fn(() =>
    Promise.resolve({
      usedFallback: true,
      encodeFrame,
      finalize,
      cancel,
    }),
  )
  const runtime: ReplayInterfaceCaptureRuntime = {
    openCapture: vi.fn(() =>
      Promise.resolve({
        width: 2560,
        height: 1440,
        drawFrame,
        onEnded: (listener: () => void) => {
          endedListeners.add(listener)
          return () => {
            endedListeners.delete(listener)
          }
        },
        stop,
      }),
    ),
    createEncoder,
    createSurface: () => ({
      canvas: {} as HTMLCanvasElement,
      context: {} as CanvasRenderingContext2D,
    }),
    createBitmap: vi.fn(() =>
      Promise.resolve({ close: bitmapClose } as unknown as ImageBitmap),
    ),
    now: () => Date.now(),
  }
  return {
    runtime,
    endedListeners,
    stop,
    drawFrame,
    createEncoder,
    encodeFrame,
    finalize,
    cancel,
    bitmapClose,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('full-interface replay video capture', () => {
  it('preserves viewport aspect ratio inside the bounded encoder budget', () => {
    expect(fitReplayInterfaceVideoDimensions(3840, 2160)).toEqual({
      width: 1920,
      height: 1080,
    })
    expect(fitReplayInterfaceVideoDimensions(1440, 2560)).toEqual({
      width: 1080,
      height: 1920,
    })
    expect(fitReplayInterfaceVideoDimensions(1201, 801)).toEqual({
      width: 1200,
      height: 800,
    })
    expect(() => fitReplayInterfaceVideoDimensions(0, 1080)).toThrow(
      /invalid dimensions/,
    )
  })

  it('captures the ordinary replay after the source is active and cleans up', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const capture = makeRuntime()
    const order: string[] = []

    const resultPromise = captureReplayInterfaceVideo(
      {
        mode: 'interface',
        session: makeSession(),
        playbackSpeed: 1,
        prepareReplay: () => {
          order.push('prepare')
        },
        playReplay: () => {
          order.push('play')
          return Promise.resolve()
        },
      },
      capture.runtime,
    )

    await vi.advanceTimersByTimeAsync(2_500)
    const result = await resultPromise

    expect(order).toEqual(['prepare', 'play'])
    expect(capture.runtime.openCapture).toHaveBeenCalledTimes(1)
    expect(capture.createEncoder).toHaveBeenCalledWith({
      codec: 'avc',
      width: 1920,
      height: 1080,
      fps: 24,
    })
    expect(capture.drawFrame).toHaveBeenCalled()
    expect(capture.encodeFrame).toHaveBeenCalled()
    expect(capture.bitmapClose).toHaveBeenCalled()
    expect(capture.finalize).toHaveBeenCalledTimes(1)
    expect(capture.cancel).not.toHaveBeenCalled()
    expect(capture.stop).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      mimeType: 'video/webm',
      extension: 'webm',
      width: 1920,
      height: 1080,
      embeddedSession: false,
    })
    expect(result.frames).toBeGreaterThan(0)
  })

  it('aborts safely when tab sharing stops before replay completion', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const capture = makeRuntime()

    const resultPromise = captureReplayInterfaceVideo(
      {
        mode: 'interface',
        session: makeSession(),
        playbackSpeed: 1,
        prepareReplay: () => {},
        playReplay: (signal) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                reject(
                  signal.reason instanceof Error
                    ? signal.reason
                    : new Error('capture aborted'),
                )
              },
              { once: true },
            )
          }),
      },
      capture.runtime,
    )

    await vi.advanceTimersByTimeAsync(1)
    expect(capture.endedListeners.size).toBe(1)
    for (const listener of capture.endedListeners) listener()

    await expect(resultPromise).rejects.toThrow(
      'Screen sharing stopped before the replay finished',
    )
    expect(capture.cancel).toHaveBeenCalledTimes(1)
    expect(capture.stop).toHaveBeenCalledTimes(1)
  })
})
