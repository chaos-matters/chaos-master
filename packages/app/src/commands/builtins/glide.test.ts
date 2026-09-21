import '@/commands/builtins'
import { afterEach, describe, expect, it } from 'vitest'
import { executeCommand, executeReplayCommand, getCommand, preflightReplayCommand, } from '@/commands/registry'
import { createGlideRuntime, glideEnabled, glideQualityPreference, setGlideEnabled, setGlideQualityPreference, setGlideRuntime, } from '@/flame/glide/runtime'
import { makeFlame } from '@/flame/glide/testUtils'
import { deepClone } from '@/utils/clone'
import { createMockCommandContext } from '@/webmcp/testUtils'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/** A runtime on a clock the test owns, so nothing waits on a real frame. */
function mountRuntime(read: () => FlameDescriptor) {
  let time = 0
  let pending: ((time: number) => void)[] = []
  const written: FlameDescriptor[] = []
  const runtime = createGlideRuntime({
    readFlame: () => deepClone(read()),
    writeFlame: (flame) => {
      written.push(deepClone(flame))
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
    written,
    advance: (ms: number) => {
      time += ms
      const due = pending
      pending = []
      for (const callback of due) callback(time)
    },
  }
}

afterEach(() => {
  setGlideRuntime(undefined)
  setGlideEnabled(false)
  setGlideQualityPreference('auto')
})

describe('glide.setEnabled / glide.setQuality', () => {
  it('flips the global mode', () => {
    const ctx = createMockCommandContext()
    executeCommand('glide.setEnabled', ctx, true)
    expect(glideEnabled()).toBe(true)
    executeCommand('glide.setEnabled', ctx, false)
    expect(glideEnabled()).toBe(false)
  })

  it('ignores a non-boolean rather than guessing', () => {
    const ctx = createMockCommandContext()
    executeCommand('glide.setEnabled', ctx, 'yes')
    expect(glideEnabled()).toBe(false)
  })

  it('sets the quality tier and rejects an unknown one', () => {
    const ctx = createMockCommandContext()
    executeCommand('glide.setQuality', ctx, 'balanced')
    expect(glideQualityPreference()).toBe('balanced')
    executeCommand('glide.setQuality', ctx, 'turbo')
    expect(glideQualityPreference()).toBe('balanced')
  })

  it('describes itself in the words a step list wants', () => {
    expect(getCommand('glide.setEnabled')?.describe?.([true])).toBe(
      'Animate changes',
    )
    expect(getCommand('glide.setQuality')?.describe?.(['full'])).toBe(
      'Glide quality: full',
    )
  })

  it('accepts only its own arguments from an untrusted session', () => {
    expect(preflightReplayCommand('glide.setEnabled', [true])).toBeUndefined()
    expect(preflightReplayCommand('glide.setEnabled', [1])).toBeDefined()
    expect(
      preflightReplayCommand('glide.setQuality', ['responsive']),
    ).toBeUndefined()
    expect(preflightReplayCommand('glide.setQuality', ['turbo'])).toBeDefined()
  })
})

describe('glide.toFlame', () => {
  const target = makeFlame({
    transforms: { one: {} },
    renderSettings: { gamma: 4 },
  })

  it('validates the descriptor it carries, like flame.load does', () => {
    expect(preflightReplayCommand('glide.toFlame', [target])).toBeUndefined()
    expect(
      preflightReplayCommand('glide.toFlame', [target, 400]),
    ).toBeUndefined()
    expect(preflightReplayCommand('glide.toFlame', [{ nope: 1 }])).toBeDefined()
    expect(
      preflightReplayCommand('glide.toFlame', [target, 99_999]),
    ).toBeDefined()
    expect(preflightReplayCommand('glide.toFlame', [])).toBeDefined()
  })

  it('arrives at the target even with no runtime to animate it', () => {
    const ctx = createMockCommandContext()
    executeReplayCommand('glide.toFlame', ctx, target)
    expect(ctx.flameDescriptor().renderSettings.gamma).toBe(4)
  })

  it('writes the target once and then animates towards it', () => {
    const ctx = createMockCommandContext()
    const world = mountRuntime(() => ctx.flameDescriptor())
    executeCommand('glide.toFlame', ctx, target, 400)
    // The document is the target immediately — the glide is presentation over
    // the top of an edit that has already landed, so undo and save see B.
    expect(ctx.flameDescriptor().renderSettings.gamma).toBe(4)
    expect(world.runtime.isGliding()).toBe(true)
    world.advance(400)
    expect(world.runtime.isGliding()).toBe(false)
    expect(world.written.at(-1)?.renderSettings.gamma).toBe(4)
  })

  it('does not animate when the duration is zero', () => {
    const ctx = createMockCommandContext()
    const world = mountRuntime(() => ctx.flameDescriptor())
    executeCommand('glide.toFlame', ctx, target, 0)
    expect(ctx.flameDescriptor().renderSettings.gamma).toBe(4)
    expect(world.runtime.isGliding()).toBe(false)
  })

  it('leaves the document alone when the descriptor is not a flame', () => {
    const ctx = createMockCommandContext()
    const before = ctx.flameDescriptor().renderSettings.gamma
    executeReplayCommand('glide.toFlame', ctx, { nope: true })
    expect(ctx.flameDescriptor().renderSettings.gamma).toBe(before)
  })
})
