import { createRoot, createSignal } from 'solid-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { useSonification } from './useSonification'
import type { SonificationConfig } from './sonification'

const audio = vi.hoisted(() => {
  const engine = {
    update: vi.fn(),
    setVolume: vi.fn(),
    setConfig: vi.fn(),
    prime: vi.fn(),
    setActive: vi.fn(),
    dispose: vi.fn(),
  }
  return {
    engine,
    createEngine: vi.fn(() => engine),
  }
})

vi.mock('./sonification', () => ({
  createSonificationEngine: audio.createEngine,
}))

const initialConfig: SonificationConfig = {
  model: 'orchestral',
  volume: 0.3,
  updateRate: 20,
  scale: 'pentatonicMajor',
  voiceCount: 8,
  harmonicDensity: 1,
  triggerRate: 4,
  spatialSpread: 0.7,
  reverbMix: 0.3,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useSonification', () => {
  it('primes one silent engine synchronously before a later enable', () => {
    const controls = createRoot((dispose) => {
      const [enabled, setEnabled] = createSignal(false)
      const [config] = createSignal(initialConfig)
      const lifecycle = useSonification(enabled, config, examples.example1)
      return { dispose, lifecycle, setEnabled }
    })

    expect(audio.createEngine).not.toHaveBeenCalled()
    controls.lifecycle.prime()
    expect(audio.createEngine).toHaveBeenCalledTimes(1)
    expect(audio.engine.prime).toHaveBeenCalledTimes(1)
    expect(audio.engine.setActive).not.toHaveBeenCalledWith(true)

    controls.setEnabled(true)
    expect(audio.createEngine).toHaveBeenCalledTimes(1)
    expect(audio.engine.setActive).toHaveBeenLastCalledWith(true)
    controls.dispose()
  })

  it('reuses one engine across enable toggles and deferred replay states', async () => {
    const controls = createRoot((dispose) => {
      const [enabled, setEnabled] = createSignal(false)
      const [deferred, setDeferred] = createSignal(false)
      const [config, setConfig] = createSignal(initialConfig)
      useSonification(enabled, config, examples.example1, deferred)
      return { dispose, setConfig, setDeferred, setEnabled }
    })

    await Promise.resolve()
    expect(audio.createEngine).not.toHaveBeenCalled()

    controls.setEnabled(true)
    expect(audio.createEngine).toHaveBeenCalledTimes(1)
    expect(audio.engine.setActive).toHaveBeenLastCalledWith(true)

    controls.setEnabled(false)
    controls.setEnabled(true)
    controls.setDeferred(true)
    controls.setEnabled(false)
    controls.setEnabled(true)
    controls.setDeferred(false)

    expect(audio.createEngine).toHaveBeenCalledTimes(1)
    expect(audio.engine.setActive).toHaveBeenCalledWith(false)
    expect(audio.engine.setActive).toHaveBeenLastCalledWith(true)

    controls.setConfig({ ...initialConfig, volume: 0.6 })
    expect(audio.engine.setConfig).toHaveBeenLastCalledWith({
      ...initialConfig,
      volume: 0.6,
    })

    controls.dispose()
    expect(audio.engine.dispose).toHaveBeenCalledTimes(1)
  })
})
