import { describe, expect, it } from 'vitest'
import { setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { getFlame } from './getFlame'

type Camera = { zoom: number; position: readonly number[] }
type Camera3D = { theta: number; phi: number; radius: number }

async function read(dimensions: 2 | 3) {
  const ctx = createMockCommandContext()
  const flame = createTestFlame()
  flame.renderSettings.dimensions = dimensions
  flame.renderSettings.camera = {
    zoom: 2.5,
    position: [0.25, -0.5],
    rotation: 0,
  }
  flame.renderSettings.camera3D = {
    theta: 0.9,
    phi: 1.1,
    radius: 7,
    target: [0, 1, 0],
    fov: 45,
    roll: 0.2,
  }
  ctx.flameDescriptor = () => flame
  setWebMcpContext(ctx)
  const result = await getFlame.execute({}, {})
  return (result as { renderSettings: Record<string, unknown> }).renderSettings
}

describe('get_flame reports the camera', () => {
  it('returns the 2D camera, which it never used to', async () => {
    // An agent could move the camera and never read where it was, so every
    // framing decision had to be relative and hope.
    const rs = await read(2)
    expect(rs.camera as Camera).toMatchObject({
      zoom: 2.5,
      position: [0.25, -0.5],
    })
  })

  it('adds the orbit camera for a 3D flame', async () => {
    const rs = await read(3)
    expect(rs.camera3D as Camera3D).toMatchObject({
      theta: 0.9,
      phi: 1.1,
      radius: 7,
    })
  })

  it('leaves the orbit camera out of a 2D flame', async () => {
    // `get_flame`'s whole point is that it fits in about 1.5 KB.
    expect(await read(2)).not.toHaveProperty('camera3D')
  })
})
