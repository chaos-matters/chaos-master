import '@/commands/builtins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentDriving, pilot, resetPilot } from '@/arcade/pilot'
import { LESSON_TOPICS, TOPIC_IDS } from '@/arcade/topics'
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
      // The topic's own number, not a copy of it: what the budget should BE is
      // settled by stepBudgetFitsVideo.test.ts, and this only checks that the
      // brief reports it.
      stepBudget: LESSON_TOPICS.variations.stepBudget,
    })
    expect(ctx.recorder!.start).toHaveBeenCalledTimes(1)
    expect(ctx.arcade!.closeHub).toHaveBeenCalledTimes(1)
    expect(ctx.sidebar.setOpen).toHaveBeenCalledWith(true)
    expect(Object.keys(ctx.flameDescriptor().transforms)).toHaveLength(0)
    expect(agentDriving()).toBe(true)
    // The brief is a tool result: it has to fit the ~1.5 KB budget.
    expect(JSON.stringify(brief).length).toBeLessThan(1500)
  })

  // One topic passing says nothing about the other three, and the brief grows
  // whenever a command is added under an allowed prefix — which is exactly how
  // it drifted over budget once already.
  it('keeps every topic brief inside the result budget', async () => {
    for (const topic of TOPIC_IDS) {
      ctxWithRecorder()
      const brief = (await arcadeStartLesson.execute({ topic }, {})) as Record<
        string,
        unknown
      >
      expect(brief).toMatchObject({ ok: true, topic })
      expect(
        JSON.stringify(brief).length,
        `${topic} brief is over the 1.5 KB result budget`,
      ).toBeLessThan(1500)
      resetPilot()
      cancelSessionRecording()
    }
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
    // The brief is sent once and cannot be asked for again — a second
    // arcade_start_lesson is refused as already active — so the half worth
    // re-reading rides on the free, read-only status call.
    expect(status.goal).toBe(LESSON_TOPICS.color.goal)
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

  it('leaves the driving phase before the save resolves', async () => {
    const ctx = ctxWithRecorder()
    let resolveSave: () => void = () => {}
    const saving = new Promise<void>((resolve) => {
      resolveSave = resolve
    })
    ctx.recorder!.save = vi.fn(() => saving)
    await arcadeStartLesson.execute({ topic: 'color' }, {})

    const ending = arcadeEndLesson.execute({ title: 'Warm tones' }, {})
    // The recorder has already stopped here. If the pilot were still driving
    // while the save awaited, a tool call landing in that window would pass
    // the guard, count a step and run unrecorded.
    expect(pilot().phase).toBe('ended')
    expect(agentDriving()).toBe(false)
    expect(
      await arcadeNarrate.execute({ text: 'in the gap' }, {}),
    ).toHaveProperty('error')
    resolveSave()
    expect(await ending).toMatchObject({
      ok: true,
      sessionName: 'Lesson: Colour and tone — Warm tones',
    })
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
