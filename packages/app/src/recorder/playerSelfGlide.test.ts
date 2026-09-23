/**
 * A replay and a step that glides itself: one change, one glide.
 *
 * With its Glide switch on, the player glides every step it applies. It did so
 * for `glide.toFlame` too, whose command had already started a glide of the
 * same change, and the runtime kept the second one, which settled on the
 * flame the step started from (code audit 2026-09-23, F1). Now the player
 * hands the duration it would have used to the command and glides nothing
 * itself; the step's own recorded duration wins over it.
 *
 * A rebuild (a seek) watches nothing, so it asks the command for no glide at
 * all: a glide left running there wrote its frames over the steps rebuilt
 * after it.
 */
import '@/commands/builtins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeReplayCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { setGlideRuntime } from '@/flame/glide/runtime'
import { mountTestGlideRuntime } from '@/flame/glide/testRuntime'
import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { DEFAULT_REPLAY_GLIDE_MS, glideMsForAction } from './glide'
import { createSessionPlayer } from './player'
import { SESSION_FORMAT_VERSION } from './schema'
import type { RecordedAction, RecordedSession } from './schema'

const FROM = examples.barnsleyFern
const TARGET = examples.heighwayDragon
const landed = () => tryValidateFlame(deepClone(TARGET))

function session(actions: RecordedAction[]): RecordedSession {
  return {
    version: SESSION_FORMAT_VERSION,
    app: { version: 'test', flameSchemaVersion: '1.0' },
    createdAt: new Date(0).toISOString(),
    initial: deepClone(FROM),
    actions,
    unnamedWriteCount: 0,
  } as unknown as RecordedSession
}

function mount(actions: RecordedAction[], replayGlide: boolean) {
  vi.useFakeTimers()
  const ctx = createMockCommandContext()
  ctx.setFlameDescriptor(() => deepClone(FROM))
  const world = mountTestGlideRuntime(
    () => ctx.flameDescriptor(),
    (next) => {
      ctx.setFlameDescriptor(() => next)
    },
  )
  const player = createSessionPlayer(
    session(actions),
    {
      loadInitial: (flame) => {
        ctx.setFlameDescriptor(() => deepClone(flame))
      },
      execute: (id, args) => executeReplayCommand(id, ctx, ...args),
      readFlame: () => deepClone(ctx.flameDescriptor()),
      settleGlide: () => world.runtime.settleForNextChange(),
      glide: (from, durationMs) => {
        void world.runtime.glideFrom(from, { durationMs })
      },
    },
    { glide: () => ({ enabled: replayGlide }) },
  )
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 16) {
      vi.advanceTimersByTime(16)
      world.advance(16)
    }
  }
  return { ctx, world, player, run }
}

const toFlame = (...duration: number[]): RecordedAction => ({
  t: 0,
  id: 'glide.toFlame',
  args: [deepClone(TARGET), ...duration],
})

afterEach(() => {
  vi.useRealTimers()
  setGlideRuntime(undefined)
})

describe('glide.toFlame in a replay', () => {
  it('Glide on: one glide, for the duration the step recorded', () => {
    const { ctx, world, player, run } = mount([toFlame(800)], true)
    player.play()
    run(6000)
    expect(player.stepIndex()).toBe(0)
    expect(world.starts).toEqual([{ durationMs: 800 }])
    expect(world.runtime.isGliding()).toBe(false)
    expect(ctx.flameDescriptor()).toEqual(landed())
  })

  it("Glide on, no recorded duration: one glide, for the replay's", () => {
    const step = toFlame()
    const { ctx, world, player, run } = mount([step], true)
    player.play()
    run(6000)
    const replayMs = glideMsForAction(step, { enabled: true })
    expect(replayMs).toBe(DEFAULT_REPLAY_GLIDE_MS)
    expect(world.starts).toEqual([{ durationMs: replayMs }])
    expect(ctx.flameDescriptor()).toEqual(landed())
  })

  it("Glide off: one glide, the command's own", () => {
    const { ctx, world, player, run } = mount([toFlame(800)], false)
    player.play()
    run(6000)
    expect(world.starts).toEqual([{ durationMs: 800 }])
    expect(ctx.flameDescriptor()).toEqual(landed())
  })

  it('times the step the way the live replay glides it', () => {
    // The artwork export and the interface capture schedule from this number,
    // so it has to be the one glide the live replay runs: the step's own
    // duration, ahead of an authored `glideMs`, a hint or the tier's scale.
    const on = { enabled: true, durationScale: 1.5 }
    expect(glideMsForAction(toFlame(800), on)).toBe(800)
    expect(
      glideMsForAction({ ...toFlame(800), glideMs: 2000, glide: 'whole' }, on),
    ).toBe(800)
    expect(glideMsForAction(toFlame(0), on)).toBe(0)
    expect(glideMsForAction(toFlame(800), { enabled: false })).toBe(0)
  })

  it('a seek rebuilds through it without a glide, keeping the steps after it', () => {
    const exposure: RecordedAction = {
      t: 10,
      id: 'flame.setExposure',
      args: [0.9],
    }
    const { ctx, world, player, run } = mount([toFlame(800), exposure], true)
    player.seek(1)
    expect(world.starts).toEqual([])
    expect(world.runtime.isGliding()).toBe(false)
    run(2000)
    expect(ctx.flameDescriptor()).toEqual({
      ...landed(),
      renderSettings: { ...landed()!.renderSettings, exposure: 0.9 },
    })
  })
})
