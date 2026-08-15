import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { deepClone } from './clone'
import { createSonificationEngine, MAX_PERCUSSIVE_HIT_BURST, MAX_PERCUSSIVE_HITS_PER_SECOND, } from './sonification'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

class FakeAudioParam {
  value = 0
  cancelScheduledValues() {}
  setValueAtTime(value: number) {
    this.value = value
  }
  linearRampToValueAtTime(value: number) {
    this.value = value
  }
  exponentialRampToValueAtTime(value: number) {
    this.value = value
  }
}

class FakeAudioNode {
  connect() {
    return this
  }
  disconnect() {}
}

let createdHitSources = 0

class FakeAudioContext {
  static latest: FakeAudioContext | undefined

  currentTime = 10
  destination = new FakeAudioNode()
  sampleRate = 10
  state: AudioContextState = 'running'
  readonly gainParams: FakeAudioParam[] = []

  constructor() {
    FakeAudioContext.latest = this
  }

  createGain() {
    const gain = new FakeAudioParam()
    this.gainParams.push(gain)
    return Object.assign(new FakeAudioNode(), { gain })
  }

  createConvolver() {
    return Object.assign(new FakeAudioNode(), { buffer: null })
  }

  createBuffer(_channels: number, length: number) {
    return {
      getChannelData: () => new Float32Array(length),
    }
  }

  createStereoPanner() {
    return Object.assign(new FakeAudioNode(), { pan: new FakeAudioParam() })
  }

  createOscillator() {
    createdHitSources += 1
    return Object.assign(new FakeAudioNode(), {
      frequency: new FakeAudioParam(),
      onended: null,
      start() {},
      stop() {},
      type: 'sine',
    })
  }

  createBufferSource() {
    createdHitSources += 1
    return Object.assign(new FakeAudioNode(), {
      buffer: null,
      onended: null,
      start() {},
      stop() {},
    })
  }

  createBiquadFilter() {
    return Object.assign(new FakeAudioNode(), {
      frequency: new FakeAudioParam(),
      Q: new FakeAudioParam(),
      type: 'lowpass',
    })
  }

  resume() {
    this.state = 'running'
    return Promise.resolve()
  }

  suspend() {
    this.state = 'suspended'
    return Promise.resolve()
  }

  close() {
    this.state = 'closed'
    return Promise.resolve()
  }
}

function hostilePercussiveFlame(): FlameDescriptor {
  const flame = deepClone(examples.example1)
  const template = deepClone(Object.values(flame.transforms)[0]!)
  flame.transforms = Object.fromEntries(
    Array.from({ length: 128 }, (_, index) => [
      `hostile_transform_${index}`,
      { ...deepClone(template), probability: 1, visible: true },
    ]),
  )
  return flame
}

beforeEach(() => {
  createdHitSources = 0
  FakeAudioContext.latest = undefined
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('percussive sonification resource budget', () => {
  it('bounds the global hit rate for a maximal untrusted flame', () => {
    const engine = createSonificationEngine({
      model: 'percussive',
      triggerRate: 16,
    })
    const context = FakeAudioContext.latest!
    const flame = hostilePercussiveFlame()

    engine.update(flame)
    for (let frame = 1; frame <= 120; frame++) {
      context.currentTime = 10 + frame / 120
      engine.update(flame)
    }

    expect(createdHitSources).toBeLessThanOrEqual(
      MAX_PERCUSSIVE_HIT_BURST + MAX_PERCUSSIVE_HITS_PER_SECOND,
    )
    engine.dispose()
  })
})

describe('sonification browser activation', () => {
  it('primes a previously sounding engine without leaking audio before enable', () => {
    const engine = createSonificationEngine({
      model: 'orchestral',
      volume: 0.6,
    })
    const context = FakeAudioContext.latest!
    const masterGain = context.gainParams[0]!

    engine.update(examples.example1)
    expect(masterGain.value).toBe(0.6)
    engine.setActive(false)
    expect(context.state).toBe('suspended')

    engine.prime()
    expect(context.state).toBe('running')
    expect(masterGain.value).toBe(0)

    engine.setActive(true)
    expect(masterGain.value).toBe(0.6)
    engine.dispose()
  })
})
