import { createRoot, createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAudioReactive } from './useAudioReactive'
import type { Accessor } from 'solid-js'
import type { AudioAnalyzer, AudioTargetValue, LiveAudioAnalyzer, } from './audioAnalysis'
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

  it('freezes both the overlay and smoothing time while replay owns the document', async () => {
    vi.useFakeTimers()
    let dispose = () => {}
    let setSuspended: ((value: boolean) => boolean) | undefined
    const published: (AudioTargetValue[] | undefined)[] = []
    createRoot((rootDispose) => {
      dispose = rootDispose
      const [suspended, updateSuspended] = createSignal(false)
      setSuspended = updateSuspended

      useAudioReactive(
        () => true,
        () => undefined,
        () => mapping,
        (values) => {
          published.push(values)
        },
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
    expect(published).toHaveLength(1)
    const firstFrame = published[0]
    expect(firstFrame).toHaveLength(1)

    setSuspended(true)
    vi.advanceTimersByTime(100)
    // The overlay comes down once and stays down: what a replay shows must be
    // the document it replayed, with nothing of the live mic over it.
    expect(published).toEqual([firstFrame, undefined])

    setSuspended(false)
    vi.advanceTimersByTime(34)
    // And back up on the very first tick after the suspension. The smoothing
    // state survived the gap, so this frame settles inside the dirty
    // threshold and reports no change - which must not be read as "leave the
    // overlay down" while modulation is plainly running.
    expect(published).toHaveLength(3)
    expect(published[2]).toEqual(firstFrame)
    dispose()
  })
})

/*
 * `modulating` is what the glass busy switch reads (hooks/useWorkspaceGlassBusy):
 * true while the overlay is up AND moving, because only then does the canvas
 * present every frame. A paused track keeps its last values on screen, so the
 * overlay is up while the canvas settles.
 */
describe('whether modulation is running', () => {
  class FakeAudioContext {
    currentTime = 0
    destination = {}
    suspend() {
      return Promise.resolve()
    }
    resume() {
      return Promise.resolve()
    }
    close() {
      return Promise.resolve()
    }
    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        connect() {},
        disconnect() {},
        start() {},
        stop() {},
      }
    }
  }

  const fileAnalyzer: AudioAnalyzer = {
    totalFrames: 300,
    duration: 10,
    sampleRate: 48_000,
    getFrameData: () => mic.getFrameData(),
  }
  const buffer = { duration: 10 } as AudioBuffer

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function mount(source: 'file' | 'mic') {
    let modulating: Accessor<boolean> = () => false
    let dispose = () => {}
    const [paused, setPaused] = createSignal(false)
    const [suspended, setSuspended] = createSignal(false)
    const [track, setTrack] = createSignal<AudioBuffer | undefined>(buffer)
    createRoot((rootDispose) => {
      dispose = rootDispose
      modulating = useAudioReactive(
        () => true,
        track,
        () => mapping,
        () => {},
        () => mic,
        () => source,
        paused,
        () => null,
        () => {},
        () => fileAnalyzer,
        suspended,
      )
    })
    return {
      modulating: () => modulating(),
      setPaused,
      setSuspended,
      setTrack,
      dispose: () => {
        dispose()
      },
    }
  }

  it('runs from the first published frame of the mic until it is suspended', async () => {
    vi.useFakeTimers()
    const audio = mount('mic')
    await Promise.resolve()

    expect(audio.modulating()).toBe(false)
    vi.advanceTimersByTime(34)
    expect(audio.modulating()).toBe(true)

    audio.setSuspended(true)
    vi.advanceTimersByTime(34)
    expect(audio.modulating()).toBe(false)
    audio.dispose()
  })

  it('stops while a file track is paused, though its overlay stays up', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('AudioContext', FakeAudioContext)
    const audio = mount('file')
    await Promise.resolve()

    vi.advanceTimersByTime(34)
    expect(audio.modulating()).toBe(true)

    audio.setPaused(true)
    vi.advanceTimersByTime(100)
    expect(audio.modulating()).toBe(false)

    audio.setPaused(false)
    vi.advanceTimersByTime(34)
    expect(audio.modulating()).toBe(true)

    audio.setTrack(undefined)
    expect(audio.modulating()).toBe(false)
    audio.dispose()
  })
})
