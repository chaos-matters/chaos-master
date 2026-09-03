import './camera'
import { createSignal } from 'solid-js'
import { vec2f } from 'typegpu/data'
import { afterEach, describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { executeCommand, executeReplayCommand } from '../registry'
import type { v2f } from 'typegpu/data'
import type { CommandContext } from '../types'

afterEach(cancelSessionRecording)

function cameraContext(zoomValue = 1, position = vec2f(0, 0)) {
  const [zoom, setZoom] = createSignal(zoomValue)
  const [pos, setPos] = createSignal<v2f>(position)
  const ctx = {
    zoom,
    setZoom,
    position: pos,
    setPosition: setPos,
  } as unknown as CommandContext
  return { ctx, zoom, position: pos }
}

describe('camera framing commands', () => {
  it('pans to an absolute position and records the step', () => {
    const { ctx, position } = cameraContext()

    expect(startSessionRecording(examples.example1).ok).toBe(true)
    executeCommand('camera.panTo', ctx, 0.5, -0.25)
    const session = stopSessionRecording()!

    expect([position().x, position().y]).toEqual([0.5, -0.25])
    expect(session.actions).toMatchObject([
      { id: 'camera.panTo', args: [0.5, -0.25] },
    ])
  })

  it('pans by an offset from wherever the camera already is', () => {
    const { ctx, position } = cameraContext(1, vec2f(1, 1))

    executeCommand('camera.panBy', ctx, -0.25, 0.5)

    expect([position().x, position().y]).toEqual([0.75, 1.5])
  })

  it('multiplies the current zoom', () => {
    const { ctx, zoom } = cameraContext(2)

    executeCommand('camera.zoomBy', ctx, 3)

    expect(zoom()).toBe(6)
  })

  it('ignores a zoom factor that is not a zoom', () => {
    const { ctx, zoom } = cameraContext(2)

    executeCommand('camera.zoomBy', ctx, 0)
    executeCommand('camera.zoomBy', ctx, -4)

    expect(zoom()).toBe(2)
  })

  it('frames position and zoom as one step', () => {
    const { ctx, zoom, position } = cameraContext()

    executeCommand('camera.frame', ctx, -1.5, 2, 4)

    expect([position().x, position().y]).toEqual([-1.5, 2])
    expect(zoom()).toBe(4)
  })

  it('clamps zoom to the range the flame schema accepts', () => {
    const { ctx, zoom } = cameraContext(400)

    executeCommand('camera.zoomBy', ctx, 1000)
    expect(zoom()).toBe(500)

    executeCommand('camera.zoomTo', ctx, 0.000_001)
    expect(zoom()).toBe(0.01)
  })

  it('clamps a pan far outside any flame instead of losing the viewport', () => {
    const { ctx, position } = cameraContext()

    executeCommand('camera.panTo', ctx, 1e9, -1e9)

    expect([position().x, position().y]).toEqual([10_000, -10_000])
  })

  it('replays valid arguments and rejects malformed ones', () => {
    const { ctx, zoom, position } = cameraContext()

    expect(executeReplayCommand('camera.panTo', ctx, 1, 2)).toBe(true)
    expect([position().x, position().y]).toEqual([1, 2])

    expect(executeReplayCommand('camera.panTo', ctx, 'left', 2)).toBe(false)
    expect(executeReplayCommand('camera.panTo', ctx, 1)).toBe(false)
    expect([position().x, position().y]).toEqual([1, 2])

    expect(executeReplayCommand('camera.frame', ctx, 0, 0, 2)).toBe(true)
    expect(zoom()).toBe(2)
    expect(executeReplayCommand('camera.zoomBy', ctx, Infinity)).toBe(false)
    expect(zoom()).toBe(2)
  })
})
