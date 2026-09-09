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
type ClashPhase = ChoreographyResult['roundPhases'][number]

function calculateClashPhases(
  rounds: NonNullable<SimulateClashResult['rounds']>,
  roundCount: number,
  framesPerRound: number,
): { roundPhases: ClashPhase[]; impactFrames: number[] } {
  const roundPhases: ClashPhase[] = []
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
  return { roundPhases, impactFrames }
}

function computeFighterXPosition(
  isP1: boolean,
  outcome: string | undefined,
  winVal: number,
  oppVal: number,
  drawVal: number,
): number {
  const self = isP1 ? 'A' : 'B'
  const opp = isP1 ? 'B' : 'A'
  if (outcome === self) return winVal
  if (outcome === opp) return oppVal
  return drawVal
}

function buildFighterXKeyframes(
  isP1: boolean,
  baseX: number,
  roundPhases: ClashPhase[],
  roundCount: number,
  framesPerRound: number,
  finalWinner: 'A' | 'B' | 'draw' | undefined,
): TimelineTrack['keyframes'] {
  const keyframes: TimelineTrack['keyframes'] = []
  const recoilOffset = Math.max(2, Math.floor(framesPerRound * 0.15))

  for (let rIdx = 0; rIdx < roundCount; rIdx++) {
    const phase = roundPhases[rIdx]!
    const isFinalRound = rIdx === roundCount - 1
    const { startFrame, impactFrame, endFrame, winner: rWin } = phase

    // Phase 1: Staging at perimeter
    keyframes.push({
      frame: startFrame,
      value: baseX,
      easing: 'easeInOut',
      interp: 'spline',
    })

    // Phase 2: High-speed dash to clash zone
    keyframes.push({
      frame: impactFrame,
      value: computeFighterXPosition(
        isP1,
        rWin,
        isP1 ? 0.35 : -0.35,
        isP1 ? -0.85 : 0.85,
        isP1 ? -0.15 : 0.15,
      ),
      easing: 'easeInOut',
      interp: 'spline',
    })

    // Phase 3: Recoil or drive-through
    keyframes.push({
      frame: impactFrame + recoilOffset,
      value: computeFighterXPosition(
        isP1,
        rWin,
        isP1 ? 0.25 : -0.25,
        isP1 ? -1.8 : 1.8,
        isP1 ? -0.4 : 0.4,
      ),
      easing: 'easeOut',
      interp: 'spline',
    })

    // Phase 4: Reset or Final Knockout/Victory
    if (isFinalRound) {
      keyframes.push({
        frame: endFrame,
        value: computeFighterXPosition(
          isP1,
          finalWinner,
          0.0,
          isP1 ? -3.2 : 3.2,
          isP1 ? -0.6 : 0.6,
        ),
        easing: 'easeOut',
        interp: 'spline',
      })
    } else {
      keyframes.push({
        frame: endFrame,
        value: baseX * 0.85,
        easing: 'easeInOut',
        interp: 'spline',
      })
    }
  }

  return keyframes
}

function generateFighterXTracks(
  fighter: 'A' | 'B',
  transformIds: string[],
  baseTransforms: Record<string, TransformFunction>,
  roundPhases: ClashPhase[],
  roundCount: number,
  framesPerRound: number,
  finalWinner: 'A' | 'B' | 'draw' | undefined,
  separation: number,
  xParam: string,
): TimelineTrack[] {
  const isP1 = fighter === 'A'
  const defaultBase = isP1 ? -separation : separation
  const tracks: TimelineTrack[] = []

  for (const tid of transformIds) {
    const tObj = baseTransforms[tid]
    const basePost = (tObj?.postAffine ?? {}) as Record<string, number>
    const baseX = basePost[xParam] ?? defaultBase

    tracks.push({
      parameterPath: `transform.${tid}.postAffine.${xParam}`,
      keyframes: buildFighterXKeyframes(
        isP1,
        baseX,
        roundPhases,
        roundCount,
        framesPerRound,
        finalWinner,
      ),
    })
  }

  return tracks
}

function generateFighterYTracks(
  transformIds: string[],
  roundPhases: ClashPhase[],
  roundCount: number,
  yParam: string,
): TimelineTrack[] {
  const tracks: TimelineTrack[] = []
  for (const tid of transformIds) {
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
  return tracks
}

function generateFighterZTracks(
  transformIds: string[],
  roundPhases: ClashPhase[],
  roundCount: number,
  zParam: string,
): TimelineTrack[] {
  const tracks: TimelineTrack[] = []
  for (const tid of transformIds) {
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
  return tracks
}

function generateClashProbabilityTracks(
  p1TransformIds: string[],
  p2TransformIds: string[],
  baseTransforms: Record<string, TransformFunction>,
  roundPhases: ClashPhase[],
  roundCount: number,
  finalWinner?: 'A' | 'B' | 'draw',
): TimelineTrack[] {
  if (roundCount < 2 || (finalWinner !== 'A' && finalWinner !== 'B')) {
    return []
  }
  const tracks: TimelineTrack[] = []
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
  return tracks
}

function generateClashCamera3DTracks(
  roundPhases: ClashPhase[],
  roundCount: number,
  separation: number,
): TimelineTrack[] {
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

  return [
    { parameterPath: 'camera3D.theta', keyframes: thetaKeyframes },
    { parameterPath: 'camera3D.phi', keyframes: phiKeyframes },
    { parameterPath: 'camera3D.radius', keyframes: radiusKeyframes },
  ]
}

function generateClashCamera2DTracks(
  roundPhases: ClashPhase[],
  roundCount: number,
): TimelineTrack[] {
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

  return [
    { parameterPath: 'camera.zoom', keyframes: zoomKeyframes },
    { parameterPath: 'camera.x', keyframes: camXKeyframes },
    { parameterPath: 'camera.rotation', keyframes: camRotKeyframes },
  ]
}

function generateClashRenderSettingTracks(
  baseExposure: number,
  baseVibrancy: number,
  roundPhases: ClashPhase[],
  roundCount: number,
): TimelineTrack[] {
  const exposureKeyframes: TimelineTrack['keyframes'] = [
    { frame: 0, value: baseExposure, interp: 'linear' },
  ]
  const vibrancyKeyframes: TimelineTrack['keyframes'] = [
    {
      frame: 0,
      value: baseVibrancy,
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

  return [
    { parameterPath: 'exposure', keyframes: exposureKeyframes },
    { parameterPath: 'vibrancy', keyframes: vibrancyKeyframes },
    { parameterPath: 'depthColorPower', keyframes: depthKeyframes },
    { parameterPath: 'palettePhase', keyframes: phaseKeyframes },
  ]
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

  const { roundPhases, impactFrames } = calculateClashPhases(
    rounds,
    roundCount,
    framesPerRound,
  )

  const xParam = is3D ? 'd' : 'c'
  const yParam = is3D ? 'h' : 'f'
  const zParam = is3D ? 'l' : null

  const allFighterIds = [...p1TransformIds, ...p2TransformIds]

  const tracks: TimelineTrack[] = [
    ...generateFighterXTracks(
      'A',
      p1TransformIds,
      baseTransforms,
      roundPhases,
      roundCount,
      framesPerRound,
      simulation.winner,
      separation,
      xParam,
    ),
    ...generateFighterXTracks(
      'B',
      p2TransformIds,
      baseTransforms,
      roundPhases,
      roundCount,
      framesPerRound,
      simulation.winner,
      separation,
      xParam,
    ),
    ...generateFighterYTracks(allFighterIds, roundPhases, roundCount, yParam),
    ...(is3D && zParam
      ? generateFighterZTracks(allFighterIds, roundPhases, roundCount, zParam)
      : []),
    ...generateClashProbabilityTracks(
      p1TransformIds,
      p2TransformIds,
      baseTransforms,
      roundPhases,
      roundCount,
      simulation.winner,
    ),
    ...(is3D
      ? generateClashCamera3DTracks(roundPhases, roundCount, separation)
      : generateClashCamera2DTracks(roundPhases, roundCount)),
    ...generateClashRenderSettingTracks(
      clashFlame.renderSettings.exposure ?? 1.2,
      clashFlame.renderSettings.vibrancy ?? 1.0,
      roundPhases,
      roundCount,
    ),
  ]

  return {
    tracks,
    totalFrames,
    impactFrames,
    roundPhases,
  }
}
