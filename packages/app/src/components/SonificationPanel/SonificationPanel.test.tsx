import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SonificationPanel } from './SonificationPanel'
import type { SonificationConfig } from '@/utils/sonification'

const initialConfig = (): SonificationConfig => ({
  model: 'orchestral',
  volume: 0.3,
  updateRate: 20,
  scale: 'pentatonicMajor',
  voiceCount: 8,
  harmonicDensity: 1,
  triggerRate: 4,
  spatialSpread: 0.7,
  reverbMix: 0.3,
})

describe('SonificationPanel recorder wiring', () => {
  afterEach(cleanup)

  it('reports semantic controls and brackets a continuous slider gesture', () => {
    const [config, setConfig] = createSignal(initialConfig())
    const onEnabledChange = vi.fn()
    const onConfigChange = vi.fn(
      (next: SonificationConfig, _key: keyof SonificationConfig) => {
        setConfig(next)
      },
    )
    const onConfigGestureBoundary = vi.fn()

    const { container } = render(() => (
      <SonificationPanel
        onClose={vi.fn()}
        enabled={() => false}
        onEnabledChange={onEnabledChange}
        config={config}
        onConfigChange={onConfigChange}
        onConfigGestureBoundary={onConfigGestureBoundary}
        keepPlayingWhenClosed={() => false}
        onKeepPlayingChange={vi.fn()}
      />
    ))

    fireEvent.click(screen.getByRole('button', { name: 'Toggle sonification' }))
    expect(onEnabledChange).toHaveBeenCalledWith(true)

    fireEvent.click(screen.getByText('Ambient').closest('button')!)
    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: 'ambient' }),
      'model',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Minor' }))
    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: 'ambient', scale: 'pentatonicMinor' }),
      'scale',
    )

    const volume = container.querySelector<HTMLInputElement>(
      '[data-parameter-path="sonification.volume"]',
    )
    expect(volume).not.toBeNull()
    fireEvent.pointerDown(volume!)
    fireEvent.input(volume!, { target: { value: '0.55' } })
    fireEvent.pointerUp(volume!)
    fireEvent.change(volume!)
    fireEvent.blur(volume!)

    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ volume: 0.55 }),
      'volume',
    )
    expect(onConfigGestureBoundary).toHaveBeenCalledTimes(4)
  })
})
