// flame.setRenderSetting and a held timeline frame: which 2D camera edits
// take the canvas off the frame, and which leave it there.
import './renderSettings'
import { createSignal } from 'solid-js'
import { describe, expect, it } from 'vitest'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { executeCommand, executeReplayCommand } from '../registry'
import type { CommandContext } from '../types'
import type { TimelineTrack } from '@/utils/timeline'

/** A full turn over 48 frames: the editor-rotate-drag repro. */
const TURN: TimelineTrack = {
  parameterPath: 'camera.rotation',
  keyframes: [
    { frame: 0, value: 0, easing: 'linear' },
    { frame: 48, value: 2 * Math.PI, easing: 'linear' },
  ],
}

function track(parameterPath: string): TimelineTrack {
  return {
    parameterPath,
    keyframes: [
      { frame: 0, value: 0, easing: 'linear' },
      { frame: 48, value: 1, easing: 'linear' },
    ],
  }
}

/** A context holding frame 6 of an animation made of `tracks`. */
function heldOn(tracks: TimelineTrack[]) {
  const ctx = createMockCommandContext()
  const [previewHeld, setPreviewHeld] = createSignal(true)
  Object.assign(ctx.timeline, {
    tracks: () => tracks,
    animationEnabled: () => true,
    currentFrame: () => 6,
    setPreviewHeld,
  } satisfies Partial<CommandContext['timeline']>)
  return { ctx, previewHeld }
}

describe('a 2D pan or zoom on a held timeline frame', () => {
  it('keeps a turned frame on the canvas when no track drives the pan or the zoom', () => {
    // Leaving the frame would drop its camera.rotation and snap the view
    // unturned mid-drag, while the pan keeps moving the turned view's point.
    for (const run of [executeCommand, executeReplayCommand]) {
      const { ctx, previewHeld } = heldOn([TURN])

      run('flame.setRenderSetting', ctx, 'camera.position', [0.4, -0.2])
      run('flame.setRenderSetting', ctx, 'camera.zoom', 1.5)

      expect(previewHeld(), run.name).toBe(true)
      expect(ctx.flameDescriptor().renderSettings.camera.position).toEqual([
        0.4, -0.2,
      ])
      expect(ctx.flameDescriptor().renderSettings.camera.zoom).toBe(1.5)
    }
  })

  it('leaves the frame when a track drives the axis the pan moves', () => {
    // The frame would show the track's value, and the pan would not show.
    for (const path of ['camera.x', 'camera.y']) {
      const { ctx, previewHeld } = heldOn([TURN, track(path)])

      executeCommand('flame.setRenderSetting', ctx, 'camera.position', [1, 1])

      expect(previewHeld(), path).toBe(false)
    }
  })

  it('leaves the frame for a zoom only when a track drives the zoom', () => {
    const panned = heldOn([TURN, track('camera.x')])
    executeCommand('flame.setRenderSetting', panned.ctx, 'camera.zoom', 2)
    expect(panned.previewHeld()).toBe(true)

    const zoomed = heldOn([TURN, track('camera.zoom')])
    executeCommand('flame.setRenderSetting', zoomed.ctx, 'camera.zoom', 2)
    expect(zoomed.previewHeld()).toBe(false)
  })

  it('treats a track with no keyframes as no track', () => {
    const { ctx, previewHeld } = heldOn([
      TURN,
      { parameterPath: 'camera.x', keyframes: [] },
    ])

    executeCommand('flame.setRenderSetting', ctx, 'camera.position', [1, 1])

    expect(previewHeld()).toBe(true)
  })

  it('still leaves the frame for a 3D camera edit', () => {
    const { ctx, previewHeld } = heldOn([TURN])

    executeCommand('flame.setRenderSetting', ctx, 'camera3D.theta', 1.2)

    expect(previewHeld()).toBe(false)
  })
})
