import '@/commands/builtins'
import { describe, expect, it, vi } from 'vitest'
import { camera3DDefault } from '@/flame/schema/flameSchema'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { executeCommand } from '../registry'
import type { CommandContext } from '../types'

/** A 3D flame with an orbit that is nowhere near its default. */
function orbiting(): CommandContext {
  const ctx = createMockCommandContext()
  ctx.setFlameDescriptor((draft) => {
    draft.renderSettings.dimensions = 3
    draft.renderSettings.camera3D = {
      ...camera3DDefault,
      theta: 1.2,
      phi: 0.4,
      radius: 8,
      target: [1, 2, 3],
      fov: 25,
      roll: 0.6,
    }
  }, 'test')
  return ctx
}

const orbit = (ctx: CommandContext) =>
  ctx.flameDescriptor().renderSettings.camera3D

describe('the framing commands in three dimensions', () => {
  it('centres by resetting the orbit, and keeps the lens', () => {
    const ctx = orbiting()

    executeCommand('camera.center', ctx)

    expect(orbit(ctx)).toEqual({ ...camera3DDefault, fov: 25, roll: 0.6 })
    expect(ctx.setPosition).not.toHaveBeenCalled()
    expect(ctx.setZoom).not.toHaveBeenCalled()
  })

  it('zooms by moving the orbit closer, the default distance being zoom 1', () => {
    const ctx = orbiting()

    executeCommand('camera.zoomTo', ctx, 1)
    expect(orbit(ctx).radius).toBeCloseTo(camera3DDefault.radius, 6)

    executeCommand('camera.zoomTo', ctx, 2)
    expect(orbit(ctx).radius).toBeCloseTo(camera3DDefault.radius / 2, 6)

    // The angles are the one thing zoom must not touch.
    expect(orbit(ctx).theta).toBeCloseTo(1.2, 6)
    expect(orbit(ctx).phi).toBeCloseTo(0.4, 6)
  })

  it('halves the distance for a factor of two, and ignores a non-zoom', () => {
    const ctx = orbiting()

    executeCommand('camera.zoomBy', ctx, 2)
    expect(orbit(ctx).radius).toBeCloseTo(4, 6)

    executeCommand('camera.zoomBy', ctx, 0)
    executeCommand('camera.zoomBy', ctx, -4)
    expect(orbit(ctx).radius).toBeCloseTo(4, 6)
  })

  it('keeps the orbit at a distance the R control could reach', () => {
    const ctx = orbiting()

    executeCommand('camera.zoomTo', ctx, 1e9)
    expect(orbit(ctx).radius).toBe(0.1)

    executeCommand('camera.zoomTo', ctx, 0.000_001)
    expect(orbit(ctx).radius).toBe(100)
  })

  it('pans the point the orbit looks at, leaving its depth alone', () => {
    const ctx = orbiting()

    executeCommand('camera.panTo', ctx, -1.5, 2)
    expect(orbit(ctx).target).toEqual([-1.5, 2, 3])

    executeCommand('camera.panBy', ctx, 0.5, -1)
    expect(orbit(ctx).target).toEqual([-1, 1, 3])
  })

  it('frames the target and the distance as one step', () => {
    const ctx = orbiting()

    executeCommand('camera.frame', ctx, 1, -1, 4)

    expect(orbit(ctx).target).toEqual([1, -1, 3])
    expect(orbit(ctx).radius).toBeCloseTo(camera3DDefault.radius / 4, 6)
  })

  it('takes the camera from a held timeline frame, as a 2D pan does', () => {
    // Without this the reset lands in the document while the canvas keeps
    // rendering the held frame — the no-op the viewer reported.
    for (const [id, ...args] of [
      ['camera.center'],
      ['camera.zoomTo', 2],
      ['camera.zoomBy', 2],
      ['camera.panTo', 1, 1],
      ['camera.panBy', 1, 1],
      ['camera.frame', 1, 1, 2],
    ] as const) {
      const ctx = orbiting()
      const setPreviewHeld = vi.fn()
      Object.assign(ctx.timeline, { setPreviewHeld })

      executeCommand(id, ctx, ...args)

      expect(setPreviewHeld, id).toHaveBeenCalledWith(false)
    }
  })

  it('leaves the orbit alone on a 2D flame', () => {
    const ctx = createMockCommandContext()
    const before = ctx.flameDescriptor().renderSettings.camera3D

    executeCommand('camera.zoomTo', ctx, 3)
    executeCommand('camera.panTo', ctx, 1, 2)

    expect(ctx.setZoom).toHaveBeenCalledWith(3)
    expect(ctx.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 1, y: 2 }),
    )
    expect(ctx.flameDescriptor().renderSettings.camera3D).toEqual(before)
  })

  it('copes with a 3D flame that carries no orbit yet', () => {
    // `flame.setRenderSetting dimensions 3` writes the number and nothing
    // else, so the first camera command can be the one that meets a
    // descriptor with no camera3D on it.
    const ctx = createMockCommandContext()
    executeCommand('flame.setRenderSetting', ctx, 'dimensions', 3)
    expect(ctx.flameDescriptor().renderSettings.camera3D).toBeUndefined()

    executeCommand('camera.zoomBy', ctx, 2)

    expect(orbit(ctx).radius).toBeCloseTo(camera3DDefault.radius / 2, 6)
    expect(ctx.setZoom).not.toHaveBeenCalled()
  })

  it('still resets position and zoom for a 2D flame', () => {
    const ctx = createMockCommandContext()

    executeCommand('camera.center', ctx)

    expect(ctx.setZoom).toHaveBeenCalledWith(1)
    expect(ctx.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 0, y: 0 }),
    )
  })
})
