import { deepClone } from '@/utils/clone'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import { simulateClash } from '@/webmcp/tools/simulateClash'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineTrack } from '@/utils/timeline'
import type { SimulateClashResult } from '@/webmcp/tools/simulateClash'
import type { WebMcpTool } from '@/webmcp/types'

export const animateClash: WebMcpTool = {
  name: 'animate_clash',
  description:
    'Keyframes an interactive 3D camera choreography and territory fight into the timeline. Sets up establishing orbit, convergence collision, and victory resolution across 3 rounds.',
  inputSchema: {
    type: 'object',
    properties: {
      simulation: {
        type: 'object',
        description:
          'Optional pre-computed clash simulation result from simulate_clash.',
      },
      flameA: {
        type: 'object',
        description: 'Fighter 1 flame descriptor.',
      },
      flameB: {
        type: 'object',
        description: 'Fighter 2 flame descriptor.',
      },
      framesPerRound: {
        type: 'integer',
        description: 'Number of timeline frames per round. Default is 60.',
      },
    },
  },
  execute: (input: unknown) => {
    const ctx = getWebMcpContext()
    if (!ctx) return { error: 'No workspace context available.' }

    const raw = (input ?? {}) as {
      simulation?: SimulateClashResult
      flameA?: FlameDescriptor
      flameB?: FlameDescriptor
      framesPerRound?: number
    }

    const { framesPerRound = 60 } = raw
    let sim = raw.simulation

    if (!sim) {
      const f1 = raw.flameA ?? ctx.flameDescriptor()
      const f2 = raw.flameB
      if (!f1 || !f2) {
        return {
          error:
            'Must provide either a simulation result or flameA and flameB.',
        }
      }
      const simRes = simulateClash.execute(
        { flameA: f1, flameB: f2, dimensions: 3 },
        {},
      ) as SimulateClashResult
      if (!simRes || !simRes.rounds) {
        return { error: 'Failed to simulate clash.' }
      }
      sim = simRes
    }

    const round1Flame = sim.rounds[0]?.clashFlame
    if (round1Flame) {
      ctx.setFlameDescriptor(() => deepClone(round1Flame), 'Animate 3D Clash')
    }

    const totalFrames = framesPerRound * 3
    const separation = 2.2

    const tracks: TimelineTrack[] = [
      {
        parameterPath: 'camera3D.theta',
        keyframes: [
          { frame: 0, value: 0, easing: 'easeInOut', interp: 'spline' },
          {
            frame: framesPerRound,
            value: Math.PI,
            easing: 'easeInOut',
            interp: 'spline',
          },
          {
            frame: framesPerRound * 2,
            value: 2 * Math.PI,
            easing: 'easeInOut',
            interp: 'spline',
          },
          {
            frame: totalFrames,
            value: sim.winner === 'A' ? 2 * Math.PI - 0.5 : 2 * Math.PI + 0.5,
            easing: 'easeOut',
            interp: 'spline',
          },
        ],
      },
      {
        parameterPath: 'camera3D.phi',
        keyframes: [
          { frame: 0, value: 1.2, easing: 'easeInOut', interp: 'spline' },
          {
            frame: framesPerRound,
            value: 1.0,
            easing: 'easeInOut',
            interp: 'spline',
          },
          {
            frame: framesPerRound * 2,
            value: 1.4,
            easing: 'easeInOut',
            interp: 'spline',
          },
          {
            frame: totalFrames,
            value: 1.2,
            easing: 'easeOut',
            interp: 'spline',
          },
        ],
      },
      {
        parameterPath: 'camera3D.radius',
        keyframes: [
          {
            frame: 0,
            value: separation * 3.5,
            easing: 'easeInOut',
            interp: 'spline',
          },
          {
            frame: framesPerRound,
            value: separation * 2.8,
            easing: 'easeInOut',
            interp: 'spline',
          },
          {
            frame: framesPerRound * 2,
            value: separation * 1.5,
            easing: 'easeInOut',
            interp: 'spline',
          },
          {
            frame: totalFrames,
            value: separation * 2.0,
            easing: 'easeOut',
            interp: 'spline',
          },
        ],
      },
      {
        parameterPath: 'depthColorPower',
        keyframes: [
          { frame: 0, value: 0.2, easing: 'linear', interp: 'linear' },
          {
            frame: framesPerRound,
            value: 0.35,
            easing: 'linear',
            interp: 'linear',
          },
          {
            frame: framesPerRound * 2,
            value: 0.5,
            easing: 'linear',
            interp: 'linear',
          },
          {
            frame: totalFrames,
            value: 0.7,
            easing: 'easeOut',
            interp: 'linear',
          },
        ],
      },
    ]

    ctx.timeline.setTracks(tracks)
    ctx.timeline.setDuration(totalFrames)
    ctx.timeline.setCurrentFrame(0)
    ctx.timeline.setAnimationEnabled(true)

    return {
      success: true,
      message: `Generated ${tracks.length} camera animation tracks across ${totalFrames} frames for 3-round clash.`,
      totalFrames,
      winner: sim.winner,
    }
  },
}
