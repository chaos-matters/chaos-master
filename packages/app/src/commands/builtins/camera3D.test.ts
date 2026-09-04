import '@/commands/builtins'
import { describe, expect, it, vi } from 'vitest'
import { camera3DDefault } from '@/flame/schema/flameSchema'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { executeCommand } from '../registry'

describe('camera.center', () => {
  it('resets the orbit of a 3D flame and keeps the lens', () => {
    const ctx = createMockCommandContext()
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.dimensions = 3
      draft.renderSettings.camera3D = {
        ...camera3DDefault,
        theta: 1.2,
        phi: 0.4,
        radius: 9,
        target: [1, 2, 3],
        fov: 25,
        roll: 0.6,
      }
    }, 'test')
    const setPreviewHeld = vi.fn()
    Object.assign(ctx.timeline, { setPreviewHeld })

    executeCommand('camera.center', ctx)

    expect(ctx.flameDescriptor().renderSettings.camera3D).toEqual({
      ...camera3DDefault,
      fov: 25,
      roll: 0.6,
    })
    // Through the render-setting path, so a held timeline frame lets go of
    // the camera the way it does for a 2D pan.
    expect(setPreviewHeld).toHaveBeenCalledWith(false)
    expect(ctx.setPosition).not.toHaveBeenCalled()
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
