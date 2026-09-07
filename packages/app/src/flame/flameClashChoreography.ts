import type { FlameDescriptor, TransformFunction, } from '@/flame/schema/flameSchema'
import type { TimelineTrack } from '@/utils/timeline'
import type { SimulateClashResult } from '@/webmcp/tools/simulateClash'

export interface ClashChoreographyOptions {
  framesPerRound?: number
  dimensions?: 2 | 3
  separation?: number
}

export interface ChoreographyResult {
  tracks: TimelineTrack[]
  totalFrames: number
  impactFrames: number[]
  roundPhases: Array<{
    round: number
    startFrame: number
    impactFrame: number
    endFrame: number
    winner: 'A' | 'B' | 'draw'
    event: string | null
  }>
}

/**
 * Generates dynamic, kinetic keyframe animation tracks for both 3D and 2D flame clashes.
 *
 * Implements a 4-phase kinetic combat loop per round:
 * 1. Approach & Stance Drift (Frames 0-25% of round): Floating hover oscillation
 * 2. Charge & Dash (Frames 25-55% of round): Fast dash toward center collision
 * 3. Impact & Kinetic Recoil (Frames 55-75% of round): Blinding impact flash, camera shake,
 *    winner push-through, and loser recoil deceleration
 * 4. Regroup / Climax Resolution (Frames 75-100% of round):
 *    - In early rounds: reset to battle perimeter
 *    - In final round: Winner surges to center with scale/spin bloom, loser dissipates
 */
export function generateClashKeyframeTracks(
  clashFlame: FlameDescriptor,
  simulation: SimulateClashResult,
  options: ClashChoreographyOptions = {},
): ChoreographyResult {
  const { framesPerRound = 30 } = options
  const is3D =
    options.dimensions === 3 ||
    (options.dimensions === undefined &&
      clashFlame.renderSettings.dimensions === 3)
  const defaultSep = is3D ? 2.2 : 2.0
  const separation = options.separation ?? defaultSep

  const rounds = simulation.rounds ?? []
  const roundCount = Math.max(1, rounds.length)
  const totalFrames = framesPerRound * roundCount

  const p1TransformIds: string[] = []
  const p2TransformIds: string[] = []

  const baseTransforms = (clashFlame.transforms ?? {}) as Record<
    string,
    TransformFunction
  >
  for (const tid of Object.keys(baseTransforms)) {
    if (tid.startsWith('p1_')) {
      p1TransformIds.push(tid)
    } else if (tid.startsWith('p2_')) {
      p2TransformIds.push(tid)
    }
  }

  // Pre-calculate round timing and phase metadata
  const roundPhases: ChoreographyResult['roundPhases'] = []
  const impactFrames: number[] = []

  for (let rIdx = 0; rIdx < roundCount; rIdx++) {
    const rData = rounds[rIdx]
    const startFrame = rIdx * framesPerRound
    const impactFrame = startFrame + Math.floor(framesPerRound * 0.55)
    const endFrame = (rIdx + 1) * framesPerRound

    impactFrames.push(impactFrame)
    roundPhases.push({
      round: rIdx + 1,
      startFrame,
      impactFrame,
      endFrame,
      winner: rData?.winner ?? 'draw',
      event: rData?.event ?? null,
    })
  }

  const tracks: TimelineTrack[] = []

  // ── 1. Fighter Transform Kinetic Motion Tracks ──
  // P1 moves from -separation to center, P2 moves from +separation to center.
  // In 3D: postAffine.d is X translation, postAffine.h is Y, postAffine.l is Z.
  // In 2D: postAffine.c is X translation, postAffine.f is Y.
  const xParam = is3D ? 'd' : 'c'
  const yParam = is3D ? 'h' : 'f'
  const zParam = is3D ? 'l' : null

  // Generate X-translation tracks for each P1 transform
  for (const tid of p1TransformIds) {
    const tObj = baseTransforms[tid]
    const basePost = (tObj?.postAffine ?? {}) as Record<string, number>
    const baseX = basePost[xParam] ?? -separation

    const keyframes: TimelineTrack['keyframes'] = []

    for (let rIdx = 0; rIdx < roundCount; rIdx++) {
      const phase = roundPhases[rIdx]!
      const isFinalRound = rIdx === roundCount - 1
      const startF = phase.startFrame
      const impactF = phase.impactFrame
      const endF = phase.endFrame
      const rWin = phase.winner

      // Phase 1: Staging at perimeter
      keyframes.push({
        frame: startF,
        value: baseX,
        easing: 'easeInOut',
        interp: 'spline',
      })

      // Phase 2: High-speed dash to clash zone
      const clashTargetX = rWin === 'A' ? 0.35 : rWin === 'B' ? -0.85 : -0.15
      keyframes.push({
        frame: impactF,
        value: clashTargetX,
        easing: 'easeInOut',
        interp: 'spline',
      })

      // Phase 3: Recoil or drive-through
      const recoilF = impactF + Math.max(2, Math.floor(framesPerRound * 0.15))
      const recoilX = rWin === 'A' ? 0.25 : rWin === 'B' ? -1.8 : -0.4
      keyframes.push({
        frame: recoilF,
        value: recoilX,
        easing: 'easeOut',
        interp: 'spline',
      })

      // Phase 4: Reset or Final Knockout/Victory
      if (isFinalRound) {
        const finalWinner = simulation.winner
        const finalX =
          finalWinner === 'A'
            ? 0.0 // Champion takes the center stage
            : finalWinner === 'B'
              ? -3.2 // Knocked out of the arena
              : -0.6
        keyframes.push({
          frame: endF,
          value: finalX,
          easing: 'easeOut',
          interp: 'spline',
        })
      } else {
        keyframes.push({
          frame: endF,
          value: baseX * 0.85,
          easing: 'easeInOut',
          interp: 'spline',
        })
      }
    }

    tracks.push({
      parameterPath: `transform.${tid}.postAffine.${xParam}`,
      keyframes,
    })
  }

  // Generate X-translation tracks for each P2 transform
  for (const tid of p2TransformIds) {
    const tObj = baseTransforms[tid]
    const basePost = (tObj?.postAffine ?? {}) as Record<string, number>
    const baseX = basePost[xParam] ?? separation

    const keyframes: TimelineTrack['keyframes'] = []

    for (let rIdx = 0; rIdx < roundCount; rIdx++) {
      const phase = roundPhases[rIdx]!
      const isFinalRound = rIdx === roundCount - 1
      const startF = phase.startFrame
      const impactF = phase.impactFrame
      const endF = phase.endFrame
      const rWin = phase.winner

      // Phase 1: Staging at perimeter
      keyframes.push({
        frame: startF,
        value: baseX,
        easing: 'easeInOut',
        interp: 'spline',
      })

      // Phase 2: High-speed dash to clash zone
      const clashTargetX = rWin === 'B' ? -0.35 : rWin === 'A' ? 0.85 : 0.15
      keyframes.push({
        frame: impactF,
        value: clashTargetX,
        easing: 'easeInOut',
        interp: 'spline',
      })

      // Phase 3: Recoil or drive-through
      const recoilF = impactF + Math.max(2, Math.floor(framesPerRound * 0.15))
      const recoilX = rWin === 'B' ? -0.25 : rWin === 'A' ? 1.8 : 0.4
      keyframes.push({
        frame: recoilF,
        value: recoilX,
        easing: 'easeOut',
        interp: 'spline',
      })

      // Phase 4: Reset or Final Knockout/Victory
      if (isFinalRound) {
        const finalWinner = simulation.winner
        const finalX =
          finalWinner === 'B'
            ? 0.0 // Champion takes the center stage
            : finalWinner === 'A'
              ? 3.2 // Knocked out of the arena
              : 0.6
        keyframes.push({
          frame: endF,
          value: finalX,
          easing: 'easeOut',
          interp: 'spline',
        })
      } else {
        keyframes.push({
          frame: endF,
          value: baseX * 0.85,
          easing: 'easeInOut',
          interp: 'spline',
        })
      }
    }

    tracks.push({
      parameterPath: `transform.${tid}.postAffine.${xParam}`,
      keyframes,
    })
  }

  // Vertical (Y) hover bobbing and impact displacement
  for (const tid of [...p1TransformIds, ...p2TransformIds]) {
    const isP1 = tid.startsWith('p1_')
    const keyframes: TimelineTrack['keyframes'] = []

    for (let rIdx = 0; rIdx < roundCount; rIdx++) {
      const phase = roundPhases[rIdx]!
      const startF = phase.startFrame
      const impactF = phase.impactFrame
      const endF = phase.endFrame
      const dir = isP1 ? 1 : -1

      // Hover
      keyframes.push({
        frame: startF,
        value: 0,
        easing: 'easeInOut',
        interp: 'spline',
      })
      // Dash elevation
      keyframes.push({
        frame: Math.floor((startF + impactF) / 2),
        value: 0.18 * dir,
        easing: 'easeInOut',
        interp: 'spline',
      })
      // Impact compression
      keyframes.push({
        frame: impactF,
        value: -0.05 * dir,
        easing: 'linear',
        interp: 'linear',
      })
      // Post-impact settle
      keyframes.push({
        frame: endF,
        value: 0,
        easing: 'easeOut',
        interp: 'spline',
      })
    }

    tracks.push({
      parameterPath: `transform.${tid}.postAffine.${yParam}`,
      keyframes,
    })
  }

  // 3D Z-depth displacement (flanking and orbital combat in 3D volume)
  if (is3D && zParam) {
    for (const tid of [...p1TransformIds, ...p2TransformIds]) {
      const isP1 = tid.startsWith('p1_')
      const keyframes: TimelineTrack['keyframes'] = []

      for (let rIdx = 0; rIdx < roundCount; rIdx++) {
        const phase = roundPhases[rIdx]!
        const startF = phase.startFrame
        const impactF = phase.impactFrame
        const endF = phase.endFrame
        const zSign = (rIdx % 2 === 0 ? 1 : -1) * (isP1 ? 1 : -1)

        keyframes.push({
          frame: startF,
          value: 0,
          easing: 'easeInOut',
          interp: 'spline',
        })
        keyframes.push({
          frame: impactF,
          value: 0.6 * zSign,
          easing: 'easeInOut',
          interp: 'spline',
        })
        keyframes.push({
          frame: endF,
          value: 0,
          easing: 'easeOut',
          interp: 'spline',
        })
      }

      tracks.push({
        parameterPath: `transform.${tid}.postAffine.${zParam}`,
        keyframes,
      })
    }
  }

  // Probability tracks for Knockout Fade in Round 3
  if (roundCount >= 2) {
    const finalWinner = simulation.winner
    if (finalWinner === 'A' || finalWinner === 'B') {
      const losingIds = finalWinner === 'A' ? p2TransformIds : p1TransformIds
      const winningIds = finalWinner === 'A' ? p1TransformIds : p2TransformIds
      const lastPhase = roundPhases[roundCount - 1]!
      const startFade = lastPhase.impactFrame
      const endFade = lastPhase.endFrame

      // Loser fades to low probability
      for (const tid of losingIds) {
        const origProb = baseTransforms[tid]?.probability ?? 1
        tracks.push({
          parameterPath: `transform.${tid}.probability`,
          keyframes: [
            { frame: 0, value: origProb, interp: 'linear' },
            { frame: startFade, value: origProb, interp: 'linear' },
            {
              frame: endFade,
              value: Math.max(0.04, origProb * 0.1),
              easing: 'easeOut',
              interp: 'spline',
            },
          ],
        })
      }

      // Winner glows with boosted probability
      for (const tid of winningIds) {
        const origProb = baseTransforms[tid]?.probability ?? 1
        tracks.push({
          parameterPath: `transform.${tid}.probability`,
          keyframes: [
            { frame: 0, value: origProb, interp: 'linear' },
            { frame: startFade, value: origProb, interp: 'linear' },
            {
              frame: endFade,
              value: origProb * 1.35,
              easing: 'easeOut',
              interp: 'spline',
            },
          ],
        })
      }
    }
  }

  // ── 2. Camera Tracks (3D vs 2D) ──
  if (is3D) {
    // 3D Orbital Path & Cinematic Combat Zooms
    const thetaKeyframes: TimelineTrack['keyframes'] = [
      { frame: 0, value: 0, easing: 'easeInOut', interp: 'spline' },
    ]
    const phiKeyframes: TimelineTrack['keyframes'] = [
      { frame: 0, value: 1.25, easing: 'easeInOut', interp: 'spline' },
    ]
    const radiusKeyframes: TimelineTrack['keyframes'] = [
      {
        frame: 0,
        value: separation * 3.4,
        easing: 'easeInOut',
        interp: 'spline',
      },
    ]

    for (let rIdx = 0; rIdx < roundCount; rIdx++) {
      const phase = roundPhases[rIdx]!
      const impactF = phase.impactFrame
      const endF = phase.endFrame
      const baseTheta = (rIdx + 1) * ((2 * Math.PI) / roundCount)

      // Dash close-up zoom
      radiusKeyframes.push({
        frame: impactF - 2,
        value: separation * 1.5,
        easing: 'easeInOut',
        interp: 'spline',
      })
      // Camera Impact Shake (micro-jitter on collision)
      radiusKeyframes.push({
        frame: impactF,
        value: separation * 1.85,
        easing: 'linear',
        interp: 'linear',
      })
      radiusKeyframes.push({
        frame: impactF + 2,
        value: separation * 1.45,
        easing: 'easeOut',
        interp: 'spline',
      })
      // Regroup camera pull-back
      radiusKeyframes.push({
        frame: endF,
        value:
          rIdx === roundCount - 1
            ? separation * 1.9 // Victor hero framing
            : separation * 2.7,
        easing: 'easeInOut',
        interp: 'spline',
      })

      // Theta orbit
      thetaKeyframes.push({
        frame: impactF,
        value: baseTheta - 0.35,
        easing: 'easeInOut',
        interp: 'spline',
      })
      thetaKeyframes.push({
        frame: endF,
        value: baseTheta,
        easing: 'easeInOut',
        interp: 'spline',
      })

      // Phi elevation modulation
      phiKeyframes.push({
        frame: impactF,
        value: 0.95, // Low-angle heroic view on collision
        easing: 'easeInOut',
        interp: 'spline',
      })
      phiKeyframes.push({
        frame: endF,
        value: 1.2,
        easing: 'easeOut',
        interp: 'spline',
      })
    }

    tracks.push(
      { parameterPath: 'camera3D.theta', keyframes: thetaKeyframes },
      { parameterPath: 'camera3D.phi', keyframes: phiKeyframes },
      { parameterPath: 'camera3D.radius', keyframes: radiusKeyframes },
    )
  } else {
    // 2D Camera Zoom & Tracking Tracks
    const zoomKeyframes: TimelineTrack['keyframes'] = [
      { frame: 0, value: 0.65, easing: 'easeInOut', interp: 'spline' },
    ]
    const camXKeyframes: TimelineTrack['keyframes'] = [
      { frame: 0, value: 0, easing: 'easeInOut', interp: 'spline' },
    ]
    const camRotKeyframes: TimelineTrack['keyframes'] = [
      { frame: 0, value: 0, easing: 'easeInOut', interp: 'spline' },
    ]

    for (let rIdx = 0; rIdx < roundCount; rIdx++) {
      const phase = roundPhases[rIdx]!
      const impactF = phase.impactFrame
      const endF = phase.endFrame
      const rWin = phase.winner

      // Zoom Punch on impact
      zoomKeyframes.push({
        frame: impactF - 2,
        value: 1.15,
        easing: 'easeInOut',
        interp: 'spline',
      })
      zoomKeyframes.push({
        frame: impactF,
        value: 1.3, // Camera punch!
        easing: 'linear',
        interp: 'linear',
      })
      zoomKeyframes.push({
        frame: impactF + 3,
        value: 1.05,
        easing: 'easeOut',
        interp: 'spline',
      })
      zoomKeyframes.push({
        frame: endF,
        value: rIdx === roundCount - 1 ? 1.2 : 0.75,
        easing: 'easeInOut',
        interp: 'spline',
      })

      // Camera pan tracking the dominant combat action
      const focusX = rWin === 'A' ? 0.3 : rWin === 'B' ? -0.3 : 0
      camXKeyframes.push({
        frame: impactF,
        value: focusX,
        easing: 'easeInOut',
        interp: 'spline',
      })
      camXKeyframes.push({
        frame: endF,
        value: 0,
        easing: 'easeOut',
        interp: 'spline',
      })

      // Camera rotational tilt during kinetic clash
      const tilt = rWin === 'A' ? 0.06 : rWin === 'B' ? -0.06 : 0.03
      camRotKeyframes.push({
        frame: impactF,
        value: tilt,
        easing: 'easeInOut',
        interp: 'spline',
      })
      camRotKeyframes.push({
        frame: endF,
        value: 0,
        easing: 'easeOut',
        interp: 'spline',
      })
    }

    tracks.push(
      { parameterPath: 'camera.zoom', keyframes: zoomKeyframes },
      { parameterPath: 'camera.x', keyframes: camXKeyframes },
      { parameterPath: 'camera.rotation', keyframes: camRotKeyframes },
    )
  }

  // ── 3. Render Settings (Impact Flashes & Energy Surges) ──
  const baseExposure = clashFlame.renderSettings.exposure ?? 1.2
  const exposureKeyframes: TimelineTrack['keyframes'] = [
    { frame: 0, value: baseExposure, interp: 'linear' },
  ]
  const vibrancyKeyframes: TimelineTrack['keyframes'] = [
    {
      frame: 0,
      value: clashFlame.renderSettings.vibrancy ?? 1.0,
      interp: 'linear',
    },
  ]
  const depthKeyframes: TimelineTrack['keyframes'] = [
    { frame: 0, value: 0.25, interp: 'linear' },
  ]
  const phaseKeyframes: TimelineTrack['keyframes'] = [
    { frame: 0, value: 0, interp: 'linear' },
  ]

  for (let rIdx = 0; rIdx < roundCount; rIdx++) {
    const phase = roundPhases[rIdx]!
    const impactF = phase.impactFrame
    const endF = phase.endFrame

    // Impact Flash: Sudden spike in exposure at collision frame!
    exposureKeyframes.push({
      frame: Math.max(0, impactF - 1),
      value: baseExposure * 1.15,
      interp: 'linear',
    })
    exposureKeyframes.push({
      frame: impactF,
      value: baseExposure * 2.5, // Radiant flash of light
      easing: 'linear',
      interp: 'linear',
    })
    exposureKeyframes.push({
      frame: impactF + 3,
      value: baseExposure * 1.25,
      easing: 'easeOut',
      interp: 'spline',
    })
    exposureKeyframes.push({
      frame: endF,
      value: baseExposure,
      easing: 'easeOut',
      interp: 'spline',
    })

    // Vibrancy rise across rounds
    vibrancyKeyframes.push({
      frame: impactF,
      value: 1.35 + rIdx * 0.15,
      easing: 'easeInOut',
      interp: 'spline',
    })

    // Depth color intensification
    depthKeyframes.push({
      frame: endF,
      value: 0.35 + rIdx * 0.2,
      easing: 'easeInOut',
      interp: 'spline',
    })

    // Palette phase shift
    phaseKeyframes.push({
      frame: endF,
      value: (rIdx + 1) * 0.33,
      easing: 'easeInOut',
      interp: 'spline',
    })
  }

  tracks.push(
    { parameterPath: 'exposure', keyframes: exposureKeyframes },
    { parameterPath: 'vibrancy', keyframes: vibrancyKeyframes },
    { parameterPath: 'depthColorPower', keyframes: depthKeyframes },
    { parameterPath: 'palettePhase', keyframes: phaseKeyframes },
  )

  return {
    tracks,
    totalFrames,
    impactFrames,
    roundPhases,
  }
}
