import { executeCommand } from '@/commands/registry'
import { generateClashKeyframeTracks } from '@/flame/flameClashChoreography'
import { deepClone } from '@/utils/clone'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import { simulateClash } from '@/webmcp/tools/simulateClash'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { SimulateClashResult } from '@/webmcp/tools/simulateClash'
import type { WebMcpTool } from '@/webmcp/types'

export const animateClash: WebMcpTool = {
  name: 'animate_clash',
  description:
    'Keyframes an interactive 3D or 2D camera choreography and kinetic fighter territory clash into the timeline. Sets up approach, high-speed dash, impact collision flashes, recoil, and victory resolution across rounds.',
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
        description: 'Number of timeline frames per round. Default is 30.',
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

    const { framesPerRound = 30 } = raw
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
        {
          flameA: f1,
          flameB: f2,
          dimensions: f1.renderSettings?.dimensions ?? 3,
        },
        {},
      ) as SimulateClashResult
      if (!simRes || !simRes.rounds) {
        return { error: 'Failed to simulate clash.' }
      }
      sim = simRes
    }

    const round1Flame = sim.rounds[0]?.clashFlame
    if (round1Flame) {
      executeCommand('flame.load', ctx, deepClone(round1Flame), 'Animate Clash')
    }

    if (!round1Flame) {
      return { error: 'No clash flame available to animate.' }
    }

    const dimensions = (round1Flame.renderSettings?.dimensions as 2 | 3) ?? 3
    const { tracks, totalFrames } = generateClashKeyframeTracks(
      round1Flame,
      sim,
      {
        framesPerRound,
        dimensions,
      },
    )

    // Same reason: one named `timeline.loadTimeline` carrying the tracks,
    // falling back to the raw setter only where there is no edit seam (the
    // Home portal and other sandboxes).
    const base = ctx.timeline.edit?.snapshot()
    if (base) {
      executeCommand('timeline.loadTimeline', ctx, { ...base, tracks })
    } else {
      ctx.timeline.setTracks(tracks)
    }
    ctx.timeline.setDuration(totalFrames)
    ctx.timeline.setCurrentFrame(0)
    ctx.timeline.setAnimationEnabled(true)

    return {
      success: true,
      message: `Generated ${tracks.length} combat animation tracks across ${totalFrames} frames for clash.`,
      totalFrames,
      winner: sim.winner,
    }
  },
}
