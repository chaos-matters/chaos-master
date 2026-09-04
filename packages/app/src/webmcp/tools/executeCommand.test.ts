import '@/commands/builtins'
import { afterEach, describe, expect, it } from 'vitest'
import { pilotLog, resetPilot, startPilot } from '@/arcade/pilot'
import { clearPilotFocus, pilotFocus } from '@/arcade/pilotFocus'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { executeCommandTool } from './executeCommand'

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
