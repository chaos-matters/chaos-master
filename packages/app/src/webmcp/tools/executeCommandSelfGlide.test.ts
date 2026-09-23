/**
 * `execute_command` and a command that glides itself: one change, one glide.
 *
 * `glide.toFlame` animates its own change. `execute_command` glides the change
 * a command made when Glide is on or `glideMs` is set, and it used to do so
 * for `glide.toFlame` as well: two glides of one change, of which the runtime
 * kept the second, read its target off the first one's frame 0 and so landed
 * the document back on the flame it started from, about one glide in five
 * across the built-in examples (code audit 2026-09-23, F1).
 *
 * maff's rule (2026-09-23): always exactly one glide, the command's. Its
 * duration is the command's own argument, else the call's `glideMs`, else the
 * planner's for the change, and the take records the one it used, so a replay
 * glides the same change for the same time.
 */
import '@/commands/builtins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { restoreGlideSwitches, setGlideEnabled, setGlideRuntime, } from '@/flame/glide/runtime'
import { mountTestGlideRuntime } from '@/flame/glide/testRuntime'
import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { deepClone } from '@/utils/clone'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { executeCommandTool } from './executeCommand'
import type { CommandContext } from '@/commands/types'

// A pair the double start landed wrong: the fern's zoom comes back from the
// first glide's frame 0 as 0.17999999999999997, so the second plan had a
// channel to animate and settled on the fern.
const FROM = examples.barnsleyFern
const TARGET = examples.heighwayDragon
const landed = () => tryValidateFlame(deepClone(TARGET))

function mount(options: { stalledFrames?: boolean } = {}) {
  const ctx: CommandContext = createMockCommandContext()
  ctx.setFlameDescriptor(() => deepClone(FROM))
  setWebMcpContext(ctx)
  const world = mountTestGlideRuntime(
    () => ctx.flameDescriptor(),
    (next) => {
      ctx.setFlameDescriptor(() => next)
    },
    options,
  )
  return { ctx, world }
}

/** The tool call, started now: everything before its first await has run. */
function runTool(input: Record<string, unknown>): Promise<unknown> {
  return Promise.resolve(executeCommandTool.execute(input, {}))
}

function recordedArgs() {
  return stopSessionRecording()?.actions.map((action) => [
    action.id,
    action.args.slice(1),
  ])
}

afterEach(() => {
  vi.useRealTimers()
  cancelSessionRecording()
  clearWebMcpContext()
  setGlideRuntime(undefined)
  restoreGlideSwitches({ enabled: false, quality: 'auto' })
})

describe('glide.toFlame through execute_command', () => {
  it('Glide on: one glide, at the planner duration, landing on the target', async () => {
    const { ctx, world } = mount()
    setGlideEnabled(true)
    startSessionRecording(ctx.flameDescriptor())
    const call = runTool({
      commandId: 'glide.toFlame',
      args: [deepClone(TARGET)],
    })
    const planned = world.runtime.activePlan()?.durationMs
    expect(planned).toBeGreaterThan(0)
    world.advance(planned!)
    expect(await call).toEqual({ success: true, commandId: 'glide.toFlame' })
    expect(world.starts).toEqual([{ durationMs: planned }])
    expect(world.runtime.isGliding()).toBe(false)
    expect(ctx.flameDescriptor()).toEqual(landed())
    // The duration the glide ran for is the one the take keeps.
    expect(recordedArgs()).toEqual([['glide.toFlame', [planned]]])
  })

  it('glideMs: one glide, for that long, and the take keeps it', async () => {
    const { ctx, world } = mount()
    startSessionRecording(ctx.flameDescriptor())
    const call = runTool({
      commandId: 'glide.toFlame',
      args: [deepClone(TARGET)],
      glideMs: 1200,
    })
    world.advance(1199)
    expect(world.runtime.isGliding()).toBe(true)
    world.advance(1)
    await call
    expect(world.starts).toEqual([{ durationMs: 1200 }])
    expect(ctx.flameDescriptor()).toEqual(landed())
    expect(recordedArgs()).toEqual([['glide.toFlame', [1200]]])
  })

  it("the command's own duration wins over glideMs and the setting", async () => {
    const { ctx, world } = mount()
    setGlideEnabled(true)
    startSessionRecording(ctx.flameDescriptor())
    const call = runTool({
      commandId: 'glide.toFlame',
      args: [deepClone(TARGET), 800],
      glideMs: 1200,
    })
    world.advance(800)
    await call
    expect(world.starts).toEqual([{ durationMs: 800 }])
    expect(ctx.flameDescriptor()).toEqual(landed())
    expect(recordedArgs()).toEqual([['glide.toFlame', [800]]])
  })

  it('Glide off and nothing named: the command still glides, once, awaited', async () => {
    const { ctx, world } = mount()
    startSessionRecording(ctx.flameDescriptor())
    let done = false
    const call = runTool({
      commandId: 'glide.toFlame',
      args: [deepClone(TARGET)],
    }).then((result) => {
      done = true
      return result
    })
    const planned = world.runtime.activePlan()?.durationMs
    expect(planned).toBeGreaterThan(0)
    await Promise.resolve()
    expect(done).toBe(false)
    world.advance(planned!)
    await call
    expect(world.starts).toEqual([{ durationMs: planned }])
    expect(ctx.flameDescriptor()).toEqual(landed())
    expect(recordedArgs()).toEqual([['glide.toFlame', [planned]]])
  })

  it('glideMs 0: no glide at all, and the take says so', async () => {
    const { ctx, world } = mount()
    setGlideEnabled(true)
    startSessionRecording(ctx.flameDescriptor())
    await runTool({
      commandId: 'glide.toFlame',
      args: [deepClone(TARGET)],
      glideMs: 0,
    })
    expect(world.starts).toEqual([])
    expect(world.runtime.isGliding()).toBe(false)
    expect(ctx.flameDescriptor()).toEqual(landed())
    expect(recordedArgs()).toEqual([['glide.toFlame', [0]]])
  })

  it("reports the command's glide when the deadline landed it", async () => {
    vi.useFakeTimers()
    const { ctx } = mount({ stalledFrames: true })
    const call = runTool({
      commandId: 'glide.toFlame',
      args: [deepClone(TARGET), 400],
    })
    vi.advanceTimersByTime(10_000)
    expect(await call).toEqual({
      success: true,
      commandId: 'glide.toFlame',
      glide: { completedBy: 'deadline' },
    })
    expect(ctx.flameDescriptor()).toEqual(landed())
  })

  it('leaves no deadline behind to cut the next glide short', async () => {
    vi.useFakeTimers()
    const { ctx, world } = mount()
    setGlideEnabled(true)
    const tick = async () => {
      vi.advanceTimersByTime(16)
      world.advance(16)
      await Promise.resolve()
    }
    let firstDone = false
    const first = runTool({
      commandId: 'glide.toFlame',
      args: [deepClone(TARGET), 3000],
    }).then(() => (firstDone = true))
    for (let t = 0; !firstDone && t < 10_000; t += 16) await tick()
    await first
    expect(ctx.flameDescriptor()).toEqual(landed())

    // A 3000 ms glide on a healthy clock lands on its frames, not early on a
    // deadline some earlier glide left armed.
    let elapsed = 0
    let secondDone = false
    const second = runTool({
      commandId: 'flame.setExposure',
      args: [0.9],
      glideMs: 3000,
    }).then((result) => {
      secondDone = true
      return result
    })
    while (!secondDone && elapsed < 10_000) {
      await tick()
      elapsed += 16
    }
    expect(await second).toEqual({
      success: true,
      commandId: 'flame.setExposure',
    })
    expect(elapsed).toBeGreaterThanOrEqual(3000)
  })
})
