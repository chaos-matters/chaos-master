import './view'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { executeCommand, executeReplayCommand } from '../registry'
import type { CommandContext } from '../types'

afterEach(cancelSessionRecording)

describe('view.setPixelRatio', () => {
  it('records and replays supported live canvas resolutions', () => {
    const [pixelRatio, setPixelRatio] = createSignal(1)
    const ctx = {
      pixelRatio,
      setPixelRatio,
    } as unknown as CommandContext

    expect(startSessionRecording(examples.example1).ok).toBe(true)
    executeCommand('view.setPixelRatio', ctx, 0.5)
    const session = stopSessionRecording()!

    expect(pixelRatio()).toBe(0.5)
    expect(session.actions).toMatchObject([
      { id: 'view.setPixelRatio', args: [0.5] },
    ])

    setPixelRatio(1)
    expect(executeReplayCommand('view.setPixelRatio', ctx, 0.5)).toBe(true)
    expect(pixelRatio()).toBe(0.5)
    expect(executeReplayCommand('view.setPixelRatio', ctx, 0.75)).toBe(false)
    expect(pixelRatio()).toBe(0.5)
  })
})
