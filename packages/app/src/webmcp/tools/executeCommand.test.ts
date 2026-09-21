import '@/commands/builtins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pilotLog, resetPilot, startPilot } from '@/arcade/pilot'
import { clearPilotFocus, pilotFocus } from '@/arcade/pilotFocus'
import { createGlideRuntime, setGlideEnabled, setGlideRuntime, } from '@/flame/glide/runtime'
import { GLIDE_DEADLINE_SLACK_MS } from '@/flame/glide/types'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { deepClone } from '@/utils/clone'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { executeCommandTool } from './executeCommand'
import type { CommandContext } from '@/commands/types'

describe('execute_command dispatch', () => {
  afterEach(() => {
    cancelSessionRecording()
    clearWebMcpContext()
    resetPilot()
    clearPilotFocus()
  })

  it('records the command in an active session and honours beforeCommand', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    expect(startSessionRecording(ctx.flameDescriptor())).toEqual({ ok: true })

    const result = await executeCommandTool.execute(
      { commandId: 'flame.setExposure', args: [0.42] },
      {},
    )

    expect(result).toEqual({ success: true, commandId: 'flame.setExposure' })
    expect(ctx.beforeCommand).toHaveBeenCalledTimes(1)
    expect(ctx.flameDescriptor().renderSettings.exposure).toBe(0.42)
    const session = stopSessionRecording()
    expect(session?.actions.map((a) => [a.id, a.args])).toEqual([
      ['flame.setExposure', [0.42]],
    ])
  })

  it('still rejects invalid args before dispatch', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    const result = await executeCommandTool.execute(
      { commandId: 'flame.setExposure', args: ['not-a-number'] },
      {},
    )
    expect(result).toHaveProperty('error')
    expect(ctx.beforeCommand).not.toHaveBeenCalled()
  })

  // The live rail and the replay's step list must say the same thing about
  // the same step. Commands that render their value into their own label are
  // where the two used to diverge: the rail appended raw JSON, so a lesson
  // read "Set Sonification Sound [{\"version\":1,...}]" live and
  // "Sonification model: ambient" on replay.
  it('logs the step under the label the recorder will use', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    startPilot({
      mode: 'teach',
      topic: 'sonification',
      title: 'Teaching: Sound and sonification',
      stepBudget: 5,
      allowed: ['sonification.'],
      qualityRankAtStart: 3,
    })

    await executeCommandTool.execute(
      {
        commandId: 'sonification.setConfig',
        args: [
          {
            model: 'ambient',
            volume: 0.3,
            updateRate: 20,
            scale: 'pentatonicMajor',
            voiceCount: 8,
            harmonicDensity: 1,
            triggerRate: 4,
            spatialSpread: 0.7,
            reverbMix: 0.3,
          },
          'model',
        ],
      },
      {},
    )

    const line = pilotLog().find((entry) => entry.kind === 'command')?.text
    expect(line).toBe('Sonification model: ambient')
    expect(line).not.toContain('{')
  })

  it('names the value a scalar command set', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    startPilot({
      mode: 'teach',
      topic: 'color',
      title: 'Teaching: Colour and tone',
      stepBudget: 5,
      allowed: ['flame.'],
      qualityRankAtStart: 3,
    })

    await executeCommandTool.execute(
      { commandId: 'flame.setExposure', args: [0.42] },
      {},
    )

    // The value is what tells two steps apart, but it reads as a sentence
    // rather than as the raw call — "Set Exposure [0.42]".
    expect(pilotLog().find((e) => e.kind === 'command')?.text).toBe(
      'Exposure: 0.42',
    )
  })

  it('describes a no-argument command without an empty bracket', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    startPilot({
      mode: 'teach',
      topic: 'camera',
      title: 'Teaching: Camera and framing',
      stepBudget: 5,
      allowed: ['camera.'],
      qualityRankAtStart: 3,
    })

    await executeCommandTool.execute(
      { commandId: 'camera.center', args: [] },
      {},
    )

    // Never "Center Camera []".
    const line = pilotLog().find((e) => e.kind === 'command')?.text
    expect(line).toBe('Centre the camera')
    expect(line).not.toContain('[')
  })

  // The live spotlight and the replay follow-cam have to agree, or watching a
  // lesson live and watching its recording would point at different controls.
  it('publishes the same focus hint the recorder stamps on the action', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    expect(startSessionRecording(ctx.flameDescriptor())).toEqual({ ok: true })
    startPilot({
      mode: 'teach',
      topic: 'color',
      title: 'Teaching: Colour and tone',
      stepBudget: 5,
      allowed: ['flame.'],
      qualityRankAtStart: 3,
    })

    // A command whose hint is derived FROM its arguments, so the test fails if
    // the live path ever resolves the hint from anything but the same
    // normalized args the recorder describes.
    await executeCommandTool.execute(
      { commandId: 'flame.setRenderSetting', args: ['gamma', 2.4] },
      {},
    )

    const recorded = stopSessionRecording()?.actions[0]
    expect(recorded?.focus).toBe('param:gamma')
    // The whole action, not just the hint: the panel to open, the transform to
    // select and the affine tab to show are all derived from the id and args.
    expect(pilotFocus()?.action.focus).toBe(recorded?.focus)
    expect(pilotFocus()?.action.id).toBe(recorded?.id)
    expect(pilotFocus()?.action.args).toEqual(recorded?.args)
    // And it carries the rail's own wording, so the ring's label and the rail
    // entry cannot describe the step differently.
    expect(pilotFocus()?.label).toBe(
      pilotLog().find((e) => e.kind === 'command')?.text,
    )
  })

  it('publishes a step even when no hint can place it', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    startPilot({
      mode: 'teach',
      topic: 'color',
      title: 'Teaching: Colour and tone',
      stepBudget: 5,
      allowed: ['flame.'],
      qualityRankAtStart: 3,
    })

    // `flame.reset` rearranges everything and points at nothing.
    await executeCommandTool.execute({ commandId: 'flame.reset', args: [] }, {})

    // A step with no hint still advances the sequence: the overlay needs it to
    // retire the previous ring instead of leaving a stale one up.
    expect(pilotFocus()?.seq).toBeGreaterThan(0)
    expect(pilotFocus()?.action.focus).toBeUndefined()
  })

  it('leaves the ring where it is while the agent narrates', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    startPilot({
      mode: 'teach',
      topic: 'color',
      title: 'Teaching: Colour and tone',
      stepBudget: 5,
      allowed: ['flame.', 'lesson.'],
      qualityRankAtStart: 3,
    })

    await executeCommandTool.execute(
      { commandId: 'flame.setGamma', args: [2.4] },
      {},
    )
    const afterEdit = pilotFocus()
    await executeCommandTool.execute(
      { commandId: 'lesson.note', args: ['Gamma lifts the shadows.'] },
      {},
    )

    // The sentence explains the edit that is still ringed. Moving the ring off
    // it — or clearing it — would point away from what is being explained.
    expect(pilotFocus()).toBe(afterEdit)
    expect(pilotFocus()?.action.focus).toBe('param:gamma')
  })

  // The line the user actually reported: a boolean argument rendered as JSON.
  it('says which way a boolean toggle went', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    startPilot({
      mode: 'teach',
      topic: 'sonification',
      title: 'Teaching: Sound and sonification',
      stepBudget: 5,
      allowed: ['sidebar.open'],
      qualityRankAtStart: 3,
    })

    await executeCommandTool.execute(
      { commandId: 'sidebar.open', args: [true] },
      {},
    )

    // Never "Toggle Sidebar [true]".
    expect(pilotLog().find((e) => e.kind === 'command')?.text).toBe(
      'Open the sidebar',
    )
  })
})

/**
 * The glide option.
 *
 * Two properties beyond "it animates": the duration is PRESENTATION and must
 * never reach the recorder's `args` — a session says what the person did, not
 * how long it took to appear — and the call has to await the transition, or an
 * agent firing twenty commands stacks twenty of them.
 */
describe('execute_command glides', () => {
  afterEach(() => {
    setGlideRuntime(undefined)
    setGlideEnabled(false)
    cancelSessionRecording()
    clearWebMcpContext()
  })

  function mountRuntime(
    ctx: CommandContext,
    /** `stalledFrames`: a hidden tab, which never calls a frame back. */
    options: { stalledFrames?: boolean } = {},
  ) {
    let time = 0
    let pending: ((time: number) => void)[] = []
    const runtime = createGlideRuntime({
      readFlame: () => deepClone(ctx.flameDescriptor()),
      writeFlame: (next) => {
        ctx.setFlameDescriptor(() => deepClone(next))
      },
      now: () => time,
      requestFrame: (callback) => {
        if (options.stalledFrames === true) return 0
        pending.push(callback)
        return pending.length
      },
      cancelFrame: () => {
        pending = []
      },
    })
    setGlideRuntime(runtime)
    return {
      runtime,
      advance: (ms: number) => {
        time += ms
        const due = pending
        pending = []
        for (const callback of due) callback(time)
      },
    }
  }

  it('animates when asked and keeps the duration out of the recording', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    const world = mountRuntime(ctx)
    expect(startSessionRecording(ctx.flameDescriptor())).toEqual({ ok: true })

    const call = executeCommandTool.execute(
      { commandId: 'flame.setGamma', args: [4], glideMs: 400 },
      {},
    )
    // The command has already landed; what the viewer sees is the glide
    // playing over the top, which starts back at the gamma it came from.
    expect(world.runtime.isGliding()).toBe(true)
    expect(ctx.flameDescriptor().renderSettings.gamma).toBe(2.2)
    world.advance(400)
    expect(ctx.flameDescriptor().renderSettings.gamma).toBe(4)
    expect(await call).toEqual({ success: true, commandId: 'flame.setGamma' })

    const session = stopSessionRecording()
    expect(session?.actions.map((action) => [action.id, action.args])).toEqual([
      ['flame.setGamma', [4]],
    ])
    expect(session?.actions[0]).not.toHaveProperty('glideMs')
  })

  it('does nothing when the mode is off and nothing is asked for', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    const world = mountRuntime(ctx)
    await executeCommandTool.execute(
      { commandId: 'flame.setGamma', args: [4] },
      {},
    )
    expect(world.runtime.isGliding()).toBe(false)
  })

  it('follows the workspace mode when no duration is given', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    const world = mountRuntime(ctx)
    setGlideEnabled(true)
    const call = executeCommandTool.execute(
      { commandId: 'flame.setGamma', args: [4] },
      {},
    )
    expect(world.runtime.isGliding()).toBe(true)
    world.advance(5000)
    await call
  })

  it('lets an explicit zero turn the mode off for one call', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    const world = mountRuntime(ctx)
    setGlideEnabled(true)
    await executeCommandTool.execute(
      { commandId: 'flame.setGamma', args: [4], glideMs: 0 },
      {},
    )
    expect(world.runtime.isGliding()).toBe(false)
  })

  it('leaves nothing running when the command changed nothing', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    const world = mountRuntime(ctx)
    const unchanged = ctx.flameDescriptor().renderSettings.gamma
    await executeCommandTool.execute(
      { commandId: 'flame.setGamma', args: [unchanged], glideMs: 400 },
      {},
    )
    // Nothing differs, so there is nothing to animate and the call returns
    // rather than holding an agent for four hundred milliseconds of stillness.
    expect(world.runtime.isGliding()).toBe(false)
    expect(ctx.flameDescriptor().renderSettings.gamma).toBe(unchanged)
  })

  it('returns on a deadline when the tab never animates, and says so', async () => {
    vi.useFakeTimers()
    try {
      const ctx = createMockCommandContext()
      setWebMcpContext(ctx)
      // Our automation browser lives on a hidden Hyprland workspace, where
      // Chrome stops running requestAnimationFrame entirely. That used to
      // leave this call pending for as long as the tab stayed hidden.
      const world = mountRuntime(ctx, { stalledFrames: true })

      const call = executeCommandTool.execute(
        { commandId: 'flame.setGamma', args: [4], glideMs: 400 },
        {},
      )
      vi.advanceTimersByTime(400 + GLIDE_DEADLINE_SLACK_MS)
      expect(world.runtime.isGliding()).toBe(false)
      // Exactly the target, not the frame the stalled glide was left on.
      expect(ctx.flameDescriptor().renderSettings.gamma).toBe(4)
      expect(await call).toEqual({
        success: true,
        commandId: 'flame.setGamma',
        glide: { completedBy: 'deadline' },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('says nothing about the glide when the animation ran it', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    const world = mountRuntime(ctx)

    const call = executeCommandTool.execute(
      { commandId: 'flame.setGamma', args: [4], glideMs: 400 },
      {},
    )
    world.advance(400)
    expect(await call).toEqual({
      success: true,
      commandId: 'flame.setGamma',
    })
  })

  it('settles the transition in flight before the next command, always', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)
    const world = mountRuntime(ctx)

    const first = executeCommandTool.execute(
      { commandId: 'flame.setGamma', args: [4], glideMs: 400 },
      {},
    )
    world.advance(200)
    expect(world.runtime.isGliding()).toBe(true)

    // A second command arriving mid-transition, asking for no glide of its
    // own. The first change still has to land on ITS target before this one
    // applies — a scripted step is a change, not a person editing what they
    // can see, so the previous transition is completed rather than cancelled.
    await executeCommandTool.execute(
      { commandId: 'flame.setExposure', args: [0.9] },
      {},
    )
    await first

    expect(world.runtime.isGliding()).toBe(false)
    expect(ctx.flameDescriptor().renderSettings.gamma).toBe(4)
    expect(ctx.flameDescriptor().renderSettings.exposure).toBe(0.9)
  })

  it('offers the option in its schema so an agent can find it', () => {
    const properties = (
      executeCommandTool.inputSchema as {
        properties: Record<string, { type: string }>
      }
    ).properties
    expect(properties.glideMs?.type).toBe('number')
    expect(properties.glideQuality?.type).toBe('string')
  })
})
