/**
 * Framing reads a fighter's middle and size off its saved camera, so the
 * view its author saw becomes the arena's unit view.
 */
import { describe, expect, it } from 'vitest'
import { camera2DViewMatrix } from '@/lib/camera2DView'
import { examples } from '../examples'
import { authoredFraming } from './framing'
import { applyAffine } from './placement'
import type { FlameDescriptor } from '../schema/flameSchema'
import type { Vec3 } from './placement'

const close = (a: Vec3, b: Vec3) => {
  for (let n = 0; n < 3; n++) expect(a[n]).toBeCloseTo(b[n]!, 9)
}

function with2DCamera(
  camera: FlameDescriptor['renderSettings']['camera'],
): FlameDescriptor {
  const base = examples.example2
  return { ...base, renderSettings: { ...base.renderSettings, camera } }
}

describe('authoredFraming in 2D', () => {
  it('matches the 2D view at aspect 1', () => {
    const camera = {
      position: [0.4, -1.2] as [number, number],
      zoom: 2.5,
      rotation: 0.6,
    }
    const framing = authoredFraming(with2DCamera(camera))
    const view = camera2DViewMatrix({
      x: camera.position[0],
      y: camera.position[1],
      zoom: camera.zoom,
      rotation: camera.rotation,
      aspect: 1,
    })
    for (const [wx, wy] of [
      [0, 0],
      [1, 0.5],
      [-0.3, 2],
    ] as const) {
      // Column-major: clip = c0 * x + c1 * y + c2.
      const [c0, c1, c2] = view.columns
      const clip = [c0.x * wx + c1.x * wy + c2.x, c0.y * wx + c1.y * wy + c2.y]
      const [fx, fy, fz] = applyAffine(framing, [wx, wy, 0])
      // The view matrix is float32.
      expect(fx).toBeCloseTo(clip[0]!, 6)
      expect(fy).toBeCloseTo(clip[1]!, 6)
      expect(fz).toBe(0)
    }
  })

  it('falls back to zoom 1 for a broken zoom', () => {
    const framing = authoredFraming(
      with2DCamera({ position: [0, 0], zoom: Number.NaN, rotation: 0 }),
    )
    close(applyAffine(framing, [1, 1, 0]), [1, 1, 0])
  })
})

describe('authoredFraming in 3D', () => {
  const galaxy = examples.example37
  const cam = galaxy.renderSettings.camera3D

  it('puts the orbit target at the origin', () => {
    close(applyAffine(authoredFraming(galaxy), cam.target), [0, 0, 0])
  })

  it('scales the shown half-height to 1', () => {
    const halfHeight = cam.radius * Math.tan((cam.fov / 2) * (Math.PI / 180))
    const [tx, ty, tz] = cam.target
    const [, y] = applyAffine(authoredFraming(galaxy), [
      tx,
      ty + halfHeight,
      tz,
    ])
    expect(y).toBeCloseTo(1, 9)
  })

  it('turns the side the author looked at toward +z', () => {
    const flame = {
      ...galaxy,
      renderSettings: {
        ...galaxy.renderSettings,
        camera3D: {
          ...cam,
          target: [0, 0, 0] as [number, number, number],
          theta: 0.9,
        },
      },
    }
    const eye: Vec3 = [Math.sin(0.9), 0, Math.cos(0.9)]
    const [x, , z] = applyAffine(authoredFraming(flame), eye)
    expect(x).toBeCloseTo(0, 9)
    expect(z).toBeGreaterThan(0)
  })
})
