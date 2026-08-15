import { createRoot, createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAudioReactive } from './useAudioReactive'
import type { LiveAudioAnalyzer } from './audioAnalysis'
import type { AudioMapping } from '@/components/AudioReactivePanel/AudioReactivePanel'

const mapping: AudioMapping = {
  preset: 'custom',
  mappings: [
    {
      audioFeature: 'bass',
      target: { kind: 'renderSetting', param: 'vibrancy' },
      sensitivity: 1,
      range: [0.5, 1.5],
    },
  ],
}

const mic: LiveAudioAnalyzer = {
  sampleRate: 48_000,
  dispose: vi.fn(),
  getFrameData: () => ({
    bands: [0, 0.5, 0, 0, 0, 0, 0, 0],
    rms: 0.25,
    centroid: 0,
    flatness: 0,
    onsetStrength: 0,
    isBeat: false,
  }),
}

describe('audio modulation suspension', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('freezes both live writes and smoothing time while replay owns the document', async () => {
    vi.useFakeTimers()
    let dispose = () => {}
    let setSuspended: ((value: boolean) => boolean) | undefined
    const setFlame = vi.fn()
    createRoot((rootDispose) => {
      dispose = rootDispose
      const [suspended, updateSuspended] = createSignal(false)
      setSuspended = updateSuspended

      useAudioReactive(
        () => true,
        () => undefined,
        () => mapping,
        setFlame,
        () => mic,
        () => 'mic',
        () => false,
        () => null,
        () => undefined,
        () => undefined,
        suspended,
      )

      // Solid schedules the first createEffect after the owning root callback;
      // wait for it before advancing the interval's fake clock.
    })

    await Promise.resolve()
    if (!setSuspended) throw new Error('audio test did not initialize')

    vi.advanceTimersByTime(34)
    expect(setFlame).toHaveBeenCalledTimes(1)

    setSuspended(true)
    vi.advanceTimersByTime(100)
    expect(setFlame).toHaveBeenCalledTimes(1)

    setSuspended(false)
    vi.advanceTimersByTime(34)
    expect(setFlame).toHaveBeenCalledTimes(2)
    dispose()
  })
})
