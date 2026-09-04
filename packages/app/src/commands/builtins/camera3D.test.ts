import './camera'
import { describe, expect, it } from 'vitest'
import { camera3DDefault } from '@/flame/schema/flameSchema'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { executeCommand } from '../registry'

describe('camera.center', () => {
  it('resets the orbit of a 3D flame, where position and zoom do nothing', () => {
    const ctx = createMockCommandContext()
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.dimensions = 3
      draft.renderSettings.camera3D = {
        ...camera3DDefault,
        theta: 1.2,
        phi: 0.4,
        radius: 9,
        target: [1, 2, 3],
      }
    }, 'test')

    executeCommand('camera.center', ctx)

    expect(ctx.flameDescriptor().renderSettings.camera3D).toEqual({
      ...camera3DDefault,
      target: [0, 0, 0],
    })
    expect(ctx.setPosition).not.toHaveBeenCalled()
    expect(ctx.setZoom).not.toHaveBeenCalled()
  })

  it('still resets position and zoom for a 2D flame', () => {
    const ctx = createMockCommandContext()

    executeCommand('camera.center', ctx)

    expect(ctx.setZoom).toHaveBeenCalledWith(1)
    expect(ctx.setPosition).toHaveBeenCalledTimes(1)
  })
})
