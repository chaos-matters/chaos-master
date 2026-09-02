import '@/commands/builtins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentDriving, pilot, resetPilot } from '@/arcade/pilot'
import { cancelSessionRecording } from '@/recorder/recorder'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { wrapTool } from '@/webmcp/registerWebMcp'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { arcadeEndLesson, arcadeNarrate, arcadeStartLesson, arcadeStatus, } from './arcadeTeach'
import { executeCommandTool } from './executeCommand'
import { setFlame } from './setFlame'

function ctxWithRecorder() {
  const ctx = createMockCommandContext()
  const stopped = {
    version: 1,
    actions: [{ t: 0, id: 'flame.setExposure', args: [0.3] }],
  }
  ctx.recorder!.stop = vi.fn(() => stopped as never)
  setWebMcpContext(ctx)
  return ctx
}

describe('Teach tools', () => {
  afterEach(() => {
    resetPilot()
    cancelSessionRecording()
    clearWebMcpContext()
  })

  it('starts a lesson: recorder on, hub closed, blank canvas, brief returned', async () => {
    const ctx = ctxWithRecorder()
    const brief = (await arcadeStartLesson.execute(
      { topic: 'variations' },
      {},
    )) as Record<string, unknown>
    expect(brief).toMatchObject({
      ok: true,
      topic: 'variations',
      stepBudget: 30,
    })
    expect(ctx.recorder!.start).toHaveBeenCalledTimes(1)
    expect(ctx.arcade!.closeHub).toHaveBeenCalledTimes(1)
    expect(ctx.sidebar.setOpen).toHaveBeenCalledWith(true)
    expect(Object.keys(ctx.flameDescriptor().transforms)).toHaveLength(0)
    expect(agentDriving()).toBe(true)
    // The brief is a tool result: it has to fit the ~1.5 KB budget.
    expect(JSON.stringify(brief).length).toBeLessThan(1500)
  })

  it('rejects unknown topics and double starts', async () => {
    ctxWithRecorder()
    expect(
      await arcadeStartLesson.execute({ topic: 'audio' }, {}),
    ).toHaveProperty('error')
    await arcadeStartLesson.execute({ topic: 'color' }, {})
    expect(
      await arcadeStartLesson.execute({ topic: 'color' }, {}),
    ).toHaveProperty('error')
  })

  it('narrates and counts steps, guards execute_command, ends and saves', async () => {
    const ctx = ctxWithRecorder()
    await arcadeStartLesson.execute({ topic: 'color' }, {})
    expect(
      await arcadeNarrate.execute({ text: 'Warmer palette first.' }, {}),
    ).toMatchObject({ ok: true, steps: 1 })
    expect(
      await executeCommandTool.execute(
        { commandId: 'flame.setExposure', args: [0.3] },
        {},
      ),
    ).toMatchObject({ success: true, steps: 2 })
    expect(
      await executeCommandTool.execute(
        { commandId: 'flame.addTransform', args: ['linearVar'] },
        {},
      ),
    ).toHaveProperty('error')
    const status = (await arcadeStatus.execute({}, {})) as Record<
      string,
      unknown
    >
    expect(status).toMatchObject({
      phase: 'driving',
      mode: 'teach',
      topic: 'color',
      steps: 2,
      locked: true,
    })
    const ended = (await arcadeEndLesson.execute(
      { title: 'Warm tones', summary: 'Palette then exposure.' },
      {},
    )) as Record<string, unknown>
    expect(ended).toMatchObject({
      ok: true,
      steps: 2,
      sessionName: 'Lesson: Colour and tone — Warm tones',
    })
    expect(ctx.recorder!.save).toHaveBeenCalledWith(
      expect.anything(),
      'Lesson: Colour and tone — Warm tones',
    )
    expect(pilot().phase).toBe('ended')
    expect(await arcadeNarrate.execute({ text: 'late' }, {})).toHaveProperty(
      'error',
    )
  })

  it('gates non-arcade write tools while driving', async () => {
    ctxWithRecorder()
    await arcadeStartLesson.execute({ topic: 'color' }, {})
    const wrapped = wrapTool(setFlame)
    const result = (await wrapped.execute({ flame: {} }, {})) as {
      isError?: boolean
    }
    expect(result.isError).toBe(true)
  })
})
