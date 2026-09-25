import { describe, expect, it } from 'vitest'
import { generateClashKeyframeTracks } from './flameClashChoreography'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { SimulateClashResult } from '@/webmcp/tools/simulateClash'

describe('flameClashChoreography', () => {
  const mockClashFlame3D = {
    version: '1.0.0',
    metadata: { name: '3D Test Clash' },
    renderSettings: {
      dimensions: 3,
      exposure: 1.2,
      vibrancy: 1.0,
      camera3D: {
        theta: 0,
        phi: 1.2,
        radius: 6.6,
        target: [0, 0, 0],
        fov: 60,
        roll: 0,
      },
    },
    transforms: {
      p1_t0_0: {
        probability: 1,
        postAffine: {
          a: 1,
          b: 0,
          c: 0,
          d: -2.2,
          e: 0,
          f: 1,
          g: 0,
          h: 0,
          i: 0,
          j: 0,
          k: 1,
          l: 0,
        },
        variations: { v0: { type: 'linear3D', weight: 1 } },
      },
      p2_t0_0: {
        probability: 1,
        postAffine: {
          a: 1,
          b: 0,
          c: 0,
          d: 2.2,
          e: 0,
          f: 1,
          g: 0,
          h: 0,
          i: 0,
          j: 0,
          k: 1,
          l: 0,
        },
        variations: { v0: { type: 'linear3D', weight: 1 } },
      },
    },
  } as unknown as FlameDescriptor

  const mockClashFlame2D = {
    version: '1.0.0',
    metadata: { name: '2D Test Clash' },
    renderSettings: {
      dimensions: 2,
      exposure: 1.2,
      vibrancy: 1.0,
      camera: {
        zoom: 1.0,
        position: [0, 0],
        rotation: 0,
      },
    },
    transforms: {
      p1_t0_0: {
        probability: 1,
        postAffine: { a: 1, b: 0, c: -2.0, d: 0, e: 1, f: 0 },
        variations: { v0: { type: 'linearVar', weight: 1 } },
      },
      p2_t0_0: {
        probability: 1,
        postAffine: { a: 1, b: 0, c: 2.0, d: 0, e: 1, f: 0 },
        variations: { v0: { type: 'linearVar', weight: 1 } },
      },
    },
  } as unknown as FlameDescriptor

  const mockSimulation: SimulateClashResult = {
    winner: 'A',
    finalScore: { A: 2, B: 1 },
    rounds: [
      {
        round: 1,
        ownershipA: 0.65,
        ownershipB: 0.35,
        contested: 0.1,
        winner: 'A',
        event: 'Nova',
        clashFlame: mockClashFlame3D,
      },
      {
        round: 2,
        ownershipA: 0.4,
        ownershipB: 0.6,
        contested: 0.15,
        winner: 'B',
        event: 'Chaos Cascade',
        clashFlame: mockClashFlame3D,
      },
      {
        round: 3,
        ownershipA: 0.7,
        ownershipB: 0.3,
        contested: 0.05,
        winner: 'A',
        event: 'Symmetry Lock',
        clashFlame: mockClashFlame3D,
      },
    ],
  }

  it('generates 3D combat tracks with orbital camera, transform translation, and exposure flashes', () => {
    const result = generateClashKeyframeTracks(
      mockClashFlame3D,
      mockSimulation,
      {
        framesPerRound: 30,
        dimensions: 3,
      },
    )

    expect(result.totalFrames).toBe(90)
    expect(result.impactFrames).toEqual([16, 46, 76])
    expect(result.roundPhases.length).toBe(3)

    const trackPaths = result.tracks.map((t) => t.parameterPath)

    // Verify 3D camera tracks exist
    expect(trackPaths).toContain('camera3D.theta')
    expect(trackPaths).toContain('camera3D.phi')
    expect(trackPaths).toContain('camera3D.radius')

    // Verify 3D transform translation tracks exist
    expect(trackPaths).toContain('transform.p1_t0_0.postAffine.d')
    expect(trackPaths).toContain('transform.p2_t0_0.postAffine.d')
    expect(trackPaths).toContain('transform.p1_t0_0.postAffine.h')
    expect(trackPaths).toContain('transform.p1_t0_0.postAffine.l')

    // Verify Render settings tracks exist
    expect(trackPaths).toContain('exposure')
    expect(trackPaths).toContain('vibrancy')
    expect(trackPaths).toContain('depthColorPower')
    expect(trackPaths).toContain('palettePhase')

    // Verify exposure flash spike on impact frame
    const exposureTrack = result.tracks.find(
      (t) => t.parameterPath === 'exposure',
    )
    expect(exposureTrack).toBeDefined()
    const impactKf = exposureTrack?.keyframes.find((kf) => kf.frame === 16)
    expect(impactKf?.value).toBeGreaterThan(2.0)

    // Verify final winner probability boosted, loser probability faded
    const p1ProbTrack = result.tracks.find(
      (t) => t.parameterPath === 'transform.p1_t0_0.probability',
    )
    const p2ProbTrack = result.tracks.find(
      (t) => t.parameterPath === 'transform.p2_t0_0.probability',
    )
    expect(p1ProbTrack).toBeDefined()
    expect(p2ProbTrack).toBeDefined()
    const p1FinalProb = p1ProbTrack?.keyframes.find((kf) => kf.frame === 90)
      ?.value as number
    const p2FinalProb = p2ProbTrack?.keyframes.find((kf) => kf.frame === 90)
      ?.value as number
    expect(p1FinalProb).toBeGreaterThan(1.0)
    expect(p2FinalProb).toBeLessThan(0.5)
  })

  it('generates 2D combat tracks with 2D camera zoom, X/Y translation, and camera tilt', () => {
    const result = generateClashKeyframeTracks(
      mockClashFlame2D,
      mockSimulation,
      {
        framesPerRound: 30,
        dimensions: 2,
      },
    )

    expect(result.totalFrames).toBe(90)
    expect(result.impactFrames).toEqual([16, 46, 76])

    const trackPaths = result.tracks.map((t) => t.parameterPath)

    // Verify 2D camera tracks exist
    expect(trackPaths).toContain('camera.zoom')
    expect(trackPaths).toContain('camera.x')
    expect(trackPaths).toContain('camera.rotation')

    // Verify 2D transform translation tracks exist (using 'c' and 'f')
    expect(trackPaths).toContain('transform.p1_t0_0.postAffine.c')
    expect(trackPaths).toContain('transform.p2_t0_0.postAffine.c')
    expect(trackPaths).toContain('transform.p1_t0_0.postAffine.f')

    // Verify 3D camera tracks are NOT present in 2D mode
    expect(trackPaths).not.toContain('camera3D.theta')
  })
})
