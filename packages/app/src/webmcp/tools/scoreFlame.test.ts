import { describe, expect, it } from 'vitest'
import { scoreFlame } from './scoreFlame'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

describe('scoreFlame tool', () => {
  it('calculates metrics correctly for a basic flame', () => {
    const flame: FlameDescriptor = {
      renderSettings: {
        dimensions: 2,
        exposure: 0.5,
        skipIters: 20,
        drawMode: 'light',
        backgroundColor: [0, 0, 0],
        vibrancy: 0.8,
        contrast: 1,
        gamma: 2.2,
        camera: { zoom: 1, position: [0, 0], rotation: 0 },
      },
      transforms: {
        t1: {
          probability: 0.5,
          preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          color: { x: 0.5, y: 0.5 },
          colorSpeed: 0.6,
          visible: true,
          variations: {
            linear: { type: 'linear', weight: 0.5 },
            julia: { type: 'julia', weight: 0.8 },
          },
        },
        t2: {
          probability: 0.5,
          preAffine: { a: 0.5, b: 0.3, c: 0.1, d: -0.3, e: 0.5, f: 0.2 },
          postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          color: { x: 0.8, y: 0.2 },
          colorSpeed: 0.9,
          visible: true,
          variations: {
            sinusoidal: { type: 'sinusoidal', weight: 1.2 },
          },
        },
      },
    } as unknown as FlameDescriptor

    const result = scoreFlame.execute({ flame }, {}) as Record<
      string,
      unknown
    >
    expect(result.success).toBe(true)

    const stats = result.stats as Record<string, unknown>
    expect(stats.powerLevel).toBeGreaterThan(0)
    expect(stats.type).toBeDefined()

    const metrics = stats.metrics as Record<string, number>
    // 2 transforms (1), 3 variations (0.6) = 1.6
    expect(metrics.complexity).toBe(1.6)
    // julia (0.8) + sinusoidal (1.2) = 2.0 * 1.5 = 3.0
    expect(metrics.chaosLevel).toBe(3.0)
    // julia (0.8) * 2.5 = 2.0
    expect(metrics.symmetryScore).toBe(2.0)
    // exp(0.5)*2 + vib(0.8)*2 + avgColorSpd(0.75)*5 = 1 + 1.6 + 3.75 = 6.35
    expect(metrics.energyIntensity).toBe(6.3)
  })
})
