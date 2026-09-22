// Who may flip the presentation switches while an agent drives, and where the
// agent learns that it may.
//
// `glideMs` on a single `execute_command` is one permission; flipping the
// switch that makes every later change flow is another, and it goes through
// the allow-list rather than through the glide gate. The two are separate
// decisions and this file is the second one.
//
// Teach, Cinema and Beats may flip `glide.setEnabled` and `glide.setQuality`:
// they present, the viewer is watching, and an agent that wants every change
// after this one to flow rather than cut should not have to remember a
// duration on each call.
//
// A duel may not. It refuses transitions outright, so the switch would be a
// setting with no effect -- and its bridge points at the rival's seat while
// the only glide runtime belongs to the player's workspace.
//
// `glide.toFlame` is on nobody's list, in any mode. It REPLACES the document
// with a flame carried in its arguments, which is the `flame.load` permission
// wearing a glide's name, and no mode grants that through the escape hatch.
//
// The switches are enforced without being advertised: no brief names them.
// A brief is a tool result held to ~1.5 KB, and the variations brief already
// sits at the edge of it. The refusal message and `list_commands` are where
// an agent finds them instead.
//
// They last for the take. It holds both as the viewer left them and gives them
// back when it ends, so an agent's presentation never becomes the editor's.
//
// Each mode is started through its real tool rather than through `startPilot`
// with a hand-written list, because the thing under test is what those tools
// assemble.
import '@/commands/builtins'
import { afterEach, describe, expect, it } from 'vitest'
import { duelActive, stopDuel } from '@/arcade/duel'
import { finishDuel } from '@/arcade/duelActions'
import { drivingState, resetPilot } from '@/arcade/pilot'
import { finishPilot } from '@/arcade/pilotActions'
import { TOPIC_IDS } from '@/arcade/topics'
import { createGlideRuntime, glideEnabled, glideQualityPreference, setGlideEnabled, setGlideQualityPreference, setGlideRuntime, } from '@/flame/glide/runtime'
import { cancelSessionRecording } from '@/recorder/recorder'
import { deepClone } from '@/utils/clone'
import { clearWebMcpContext, setWebMcpContext, setWebMcpTarget, } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { arcadeEndBeats, arcadeStartBeats } from './arcadeBeats'
import { arcadeEndCinema, arcadeStartCinema } from './arcadeCinema'
import { arcadeStartDuel } from './arcadeDuel'
import { arcadeEndLesson, arcadeStartLesson } from './arcadeTeach'
import { executeCommandTool } from './executeCommand'
import { listCommands } from './listCommands'
import type { PilotMode } from '@/arcade/pilot'
import type { CommandContext } from '@/commands/types'

/** Spelled out rather than imported: this states the decision, not the name
 *  the implementation happens to keep it under. */
const SWITCHES = ['glide.setEnabled', 'glide.setQuality'] as const

/** Start one mode the way the Arcade really starts it. */
const START: Record<PilotMode, () => unknown> = {
  // Colour and tone: a topic whose own allow-list has nothing to do with
  // glide, so a pass can only come from the presentation switches.
  teach: () => arcadeStartLesson.execute({ topic: 'color' }, {}),
  cinema: () => arcadeStartCinema.execute({}, {}),
  beats: () => arcadeStartBeats.execute({ trackName: 'Cyber Pulse' }, {}),
  duel: () => arcadeStartDuel.execute({ durationSeconds: 120 }, {}),
}

/** End one mode the way the Arcade really ends it. */
const END: Record<PilotMode, (ctx: CommandContext) => unknown> = {
  teach: () => arcadeEndLesson.execute({ title: 'Lesson' }, {}),
  cinema: () => arcadeEndCinema.execute({ title: 'Take' }, {}),
  beats: () => arcadeEndBeats.execute({ title: 'Beats' }, {}),
  // No tool ends a duel: the clock does, or the viewer's own Stop.
  duel: (ctx) => finishDuel(ctx, 'stopped'),
}

const PRESENTING: readonly PilotMode[] = ['teach', 'cinema', 'beats']
const EVERY_MODE: readonly PilotMode[] = [...PRESENTING, 'duel']

const run = async (commandId: string, args: unknown[] = []) =>
  (await executeCommandTool.execute({ commandId, args }, {})) as Record<
    string,
    unknown
  >

async function drive(mode: PilotMode): Promise<CommandContext> {
  const ctx = createMockCommandContext()
  setWebMcpContext(ctx)
  const started = (await START[mode]()) as Record<string, unknown>
  expect(started.ok, `${mode} started`).toBe(true)
  expect(drivingState()?.mode).toBe(mode)
  return ctx
}

/** Everything a session leaves behind, put back so the next test starts
 *  from the editor's defaults. */
function tearDown() {
  if (duelActive()) stopDuel()
  resetPilot()
  cancelSessionRecording()
  clearWebMcpContext('player')
  clearWebMcpContext('rival')
  setWebMcpTarget('player')
  setGlideRuntime(undefined)
  setGlideEnabled(false)
  setGlideQualityPreference('auto')
}

/** A glide runtime on a clock the test moves by hand. */
function mountRuntime(ctx: CommandContext) {
  let time = 0
  let pending: ((time: number) => void)[] = []
  const runtime = createGlideRuntime({
    readFlame: () => deepClone(ctx.flameDescriptor()),
    writeFlame: (next) => {
      ctx.setFlameDescriptor(() => deepClone(next))
    },
    now: () => time,
    requestFrame: (callback) => {
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

describe('the presentation switches while an agent drives', () => {
  afterEach(tearDown)

  for (const mode of PRESENTING) {
    it(`${mode} may turn Glide on and off`, async () => {
      await drive(mode)

      expect(await run('glide.setEnabled', [true])).toMatchObject({
        success: true,
      })
      expect(glideEnabled()).toBe(true)
      expect(await run('glide.setEnabled', [false])).toMatchObject({
        success: true,
      })
      expect(glideEnabled()).toBe(false)
    })

    it(`${mode} may choose the tier a transition gives up`, async () => {
      await drive(mode)

      expect(await run('glide.setQuality', ['full'])).toMatchObject({
        success: true,
      })
      expect(glideQualityPreference()).toBe('full')
    })
  }

  it('a duel may not, because it refuses transitions outright', async () => {
    await drive('duel')

    for (const commandId of SWITCHES) {
      const refused = await run(commandId, [
        commandId === 'glide.setEnabled' ? true : 'full',
      ])
      expect(String(refused.error)).toContain(`${commandId} is not allowed`)
    }
    expect(glideEnabled()).toBe(false)
    expect(glideQualityPreference()).toBe('auto')
  })

  for (const mode of EVERY_MODE) {
    it(`${mode} may not glide the document into a flame of the agent's own`, async () => {
      await drive(mode)

      // `glide.toFlame` carries a whole descriptor and replaces the document
      // with it. That is the `flame.load` permission, not a presentation one,
      // and no Arcade mode grants it.
      const refused = await run('glide.toFlame', [createTestFlame(), 800])

      expect(String(refused.error)).toContain('glide.toFlame is not allowed')
    })
  }
})

/**
 * Where an agent learns it may use them.
 *
 * Never the brief (see the header). The refusal message prints the list the
 * mode enforces, so an agent that reaches for the wrong command is shown the
 * right ones; `list_commands` lists every command whatever is driving, with
 * its argument shape once the query is narrowed to a prefix.
 */
describe('what the agent is told about them', () => {
  afterEach(tearDown)

  const BRIEFS: readonly (readonly [string, () => unknown])[] = [
    ...TOPIC_IDS.map(
      (topic) =>
        [
          `teach/${topic}`,
          () => arcadeStartLesson.execute({ topic }, {}),
        ] as const,
    ),
    ['cinema', START.cinema],
    ['beats', START.beats],
  ]

  for (const [name, start] of BRIEFS) {
    it(`the ${name} brief does not spend its budget on them`, async () => {
      setWebMcpContext(createMockCommandContext())
      const brief = (await start()) as {
        ok?: boolean
        allowedCommands?: readonly string[]
      }
      expect(brief.ok, `${name} started`).toBe(true)
      const named = (brief.allowedCommands ?? []).map(
        (line) => line.split(' ')[0],
      )

      expect(named.length, 'the brief lists its commands').toBeGreaterThan(0)
      expect(SWITCHES.filter((id) => named.includes(id))).toEqual([])
    })
  }

  for (const mode of EVERY_MODE) {
    const presents = PRESENTING.includes(mode)
    it(`the ${mode} refusal ${presents ? 'lists them' : 'does not list them'}`, async () => {
      await drive(mode)

      const refused = await run('glide.toFlame', [createTestFlame(), 800])
      const listed =
        String(refused.error).split('Allowed: ')[1]?.split(', ') ?? []

      expect(listed.length, 'the refusal carries the list').toBeGreaterThan(0)
      expect(SWITCHES.filter((id) => listed.includes(id))).toEqual(
        presents ? [...SWITCHES] : [],
      )
    })
  }

  it('list_commands names them, with their shapes, while a lesson runs', async () => {
    await drive('teach')

    const page = (await listCommands.execute({ prefix: 'glide.' }, {})) as {
      commands: readonly { id: string; args?: string }[]
    }

    for (const id of SWITCHES) {
      expect(
        page.commands.find((command) => command.id === id)?.args,
        id,
      ).toBeTruthy()
    }
  })
})

/**
 * When the take ends.
 *
 * The switches are for the agent's presentation, not for the editor the
 * viewer gets back. A take holds on to both as they were when it started and
 * gives them back when it ends, through its end tool or the overlay's Stop,
 * after landing whatever transition is in flight. The lock keeps the viewer
 * off them for the whole take, so what comes back is exactly what they left.
 * A duel holds nothing, because it cannot change them.
 */
describe('when the take ends', () => {
  afterEach(tearDown)

  for (const mode of PRESENTING) {
    it(`ending the ${mode} take turns Glide back off`, async () => {
      const ctx = await drive(mode)
      await run('glide.setEnabled', [true])
      expect(glideEnabled(), 'the agent turned it on').toBe(true)

      await END[mode](ctx)

      expect(drivingState(), 'the take ended').toBeUndefined()
      expect(glideEnabled()).toBe(false)
    })

    it(`ending the ${mode} take gives the quality back`, async () => {
      setGlideQualityPreference('balanced')
      const ctx = await drive(mode)
      await run('glide.setQuality', ['full'])
      expect(glideQualityPreference(), 'the agent chose a tier').toBe('full')

      await END[mode](ctx)

      expect(drivingState(), 'the take ended').toBeUndefined()
      expect(glideQualityPreference()).toBe('balanced')
    })
  }

  it('Stop gives back what the viewer had, not the defaults', async () => {
    setGlideEnabled(true)
    setGlideQualityPreference('responsive')
    const ctx = await drive('teach')
    await run('glide.setEnabled', [false])
    await run('glide.setQuality', ['full'])

    // What the overlay's Stop button, and Escape twice, call.
    await finishPilot(ctx, 'stopped')

    expect(drivingState(), 'the take ended').toBeUndefined()
    expect(glideEnabled()).toBe(true)
    expect(glideQualityPreference()).toBe('responsive')
  })

  it('a take that ends mid-transition lands it, then gives them back', async () => {
    const ctx = await drive('teach')
    const world = mountRuntime(ctx)
    await run('glide.setEnabled', [true])
    await run('glide.setQuality', ['full'])
    const moving = executeCommandTool.execute(
      { commandId: 'flame.setGamma', args: [4], glideMs: 400 },
      {},
    )
    world.advance(200)
    expect(world.runtime.isGliding(), 'a transition is in flight').toBe(true)

    await END.teach(ctx)
    await moving

    expect(world.runtime.isGliding()).toBe(false)
    expect(world.runtime.activeQuality()).toBeUndefined()
    expect(ctx.flameDescriptor().renderSettings.gamma).toBe(4)
    expect(glideEnabled()).toBe(false)
    expect(glideQualityPreference()).toBe('auto')
  })

  it('a duel leaves them as it found them', async () => {
    setGlideEnabled(true)
    setGlideQualityPreference('full')
    const ctx = await drive('duel')

    await END.duel(ctx)

    expect(drivingState(), 'the duel ended').toBeUndefined()
    expect(glideEnabled()).toBe(true)
    expect(glideQualityPreference()).toBe('full')
  })
})

/**
 * The switch thrown in the middle of a transition.
 *
 * The runtime's `setEnabled` is a signal the planner reads when the NEXT
 * change arrives; nothing in the clock consults it, so it cannot abandon a
 * transition halfway. What makes that safe here is the settle
 * `execute_command` already performs before every command it runs. Pinned
 * because "off" arriving mid-animation is exactly the shape of bug that
 * leaves a document on a frame nobody chose.
 *
 * What is pinned is the landing, not the path to it. The gate is read before
 * the switch flips, so today the call that turns Glide off is itself
 * presented: from the frame on screen to the target the settle just landed.
 */
describe('turning Glide off in the middle of one', () => {
  afterEach(tearDown)

  it('leaves the flame on the target, never on the frame it had reached', async () => {
    const ctx = await drive('teach')
    const world = mountRuntime(ctx)
    await run('glide.setEnabled', [true])
    expect(glideEnabled(), 'the agent could turn it on').toBe(true)

    const moving = executeCommandTool.execute(
      { commandId: 'flame.setGamma', args: [4], glideMs: 400 },
      {},
    )
    world.advance(200)
    expect(world.runtime.isGliding()).toBe(true)
    const partway = ctx.flameDescriptor().renderSettings.gamma
    expect(partway).toBeGreaterThan(2.2)
    expect(partway).toBeLessThan(4)

    // Moved on while the call is still in flight, so nothing here waits on
    // the wall-clock deadline to finish what the fake clock started.
    const switching = run('glide.setEnabled', [false])
    // Whatever is on screen is on its way to the target: nothing is moving,
    // or what is moving lands on the gamma the change asked for.
    expect(
      world.runtime.activePlan()?.settle.renderSettings.gamma ??
        ctx.flameDescriptor().renderSettings.gamma,
    ).toBe(4)
    world.advance(5000)
    await switching
    await moving

    expect(glideEnabled()).toBe(false)
    expect(world.runtime.isGliding()).toBe(false)
    expect(world.runtime.activeQuality()).toBeUndefined()
    expect(ctx.flameDescriptor().renderSettings.gamma).toBe(4)
  })

  it('makes the next change cut, which is what the switch is for', async () => {
    const ctx = await drive('teach')
    const world = mountRuntime(ctx)
    await run('glide.setEnabled', [true])
    expect(glideEnabled(), 'the agent could turn it on').toBe(true)
    await run('glide.setEnabled', [false])

    await run('flame.setGamma', [3])

    expect(world.runtime.isGliding()).toBe(false)
    expect(ctx.flameDescriptor().renderSettings.gamma).toBe(3)
  })
})
