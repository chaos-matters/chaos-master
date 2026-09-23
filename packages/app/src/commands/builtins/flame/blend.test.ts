/**
 * `flame.setBlendFlame` and the weight it leaves behind: what a caller that
 * names no weight gets, what one that names a weight gets, what the replay
 * policy lets through, and what a take recorded before picks carried a weight
 * replays to.
 */
import '@/commands/builtins'
import { createRoot } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import { describe, expect, it } from 'vitest'
import { executeCommand, executeReplayCommand, preflightReplayCommand, } from '@/commands/registry'
import { DEFAULT_BLEND_WEIGHT } from '@/flame/blend'
import { examples } from '@/flame/examples'
import { replaySessionInstant } from '@/recorder/replay'
import { SESSION_FORMAT_VERSION } from '@/recorder/schema'
import { createSeatCommandContext } from '@/seats/seat'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { createTimelineState } from '@/utils/timeline'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { RecordedSession } from '@/recorder/schema'

function makeWorld(start: FlameDescriptor) {
  const [flame, setFlame, history] = createStoreHistory(
    createStore(deepClone(start)),
    { journal: true },
  )
  const timeline = createTimelineState()
  const ctx = createSeatCommandContext({
    flame: () => flame,
    setFlame,
    timeline,
    history,
  })
  return { flame, history, ctx }
}

function blended(weight: number | undefined): FlameDescriptor {
  const flame = deepClone(examples.example1)
  flame.renderSettings.blendFlame = deepClone(examples.example2)
  if (weight !== undefined) flame.renderSettings.blendWeight = weight
  return flame
}

function weighted(weight: number): FlameDescriptor {
  const flame = deepClone(examples.example1)
  flame.renderSettings.blendWeight = weight
  return flame
}

describe('flame.setBlendFlame and its weight', () => {
  it('gives the default weight to a document that has none', () => {
    createRoot((dispose) => {
      const world = makeWorld(examples.example1)
      executeCommand('flame.setBlendFlame', world.ctx, examples.example2)
      expect(world.flame.renderSettings.blendWeight).toBe(DEFAULT_BLEND_WEIGHT)
      // A partner and still no weight, as an older touch pick left it: a swap
      // has no weight to keep, so it starts at the default too.
      const partnerOnly = makeWorld(blended(undefined))
      executeCommand('flame.setBlendFlame', partnerOnly.ctx, examples.example3)
      expect(partnerOnly.flame.renderSettings.blendWeight).toBe(
        DEFAULT_BLEND_WEIGHT,
      )
      dispose()
    })
  })

  it('keeps a weight the document already has when its first partner names none', () => {
    createRoot((dispose) => {
      // An agent that sets the weight first and the partner second.
      const world = makeWorld(examples.example1)
      executeCommand('flame.setBlendWeight', world.ctx, 0.7)
      executeCommand('flame.setBlendFlame', world.ctx, examples.example2)
      expect(world.flame.renderSettings.blendWeight).toBe(0.7)
      dispose()
    })
  })

  it('keeps the weight when an existing blend swaps its partner', () => {
    createRoot((dispose) => {
      const world = makeWorld(blended(0.7))
      executeCommand('flame.setBlendFlame', world.ctx, examples.example3)
      expect(world.flame.renderSettings.blendWeight).toBe(0.7)
      dispose()
    })
  })

  it('lets a weight it is given win, over none or over the one the document has', () => {
    createRoot((dispose) => {
      const weightFirst = makeWorld(weighted(0.7))
      executeCommand(
        'flame.setBlendFlame',
        weightFirst.ctx,
        examples.example2,
        0.25,
      )
      expect(weightFirst.flame.renderSettings.blendWeight).toBe(0.25)

      const world = makeWorld(examples.example1)
      executeCommand('flame.setBlendFlame', world.ctx, examples.example2, 0.25)
      expect(world.flame.renderSettings.blendWeight).toBe(0.25)
      executeCommand('flame.setBlendFlame', world.ctx, examples.example3, 0.9)
      expect(world.flame.renderSettings.blendWeight).toBe(0.9)
      // One entry per pick, and each undo restores the weight with the
      // partner it came with.
      world.history.undo()
      expect(world.flame.renderSettings.blendWeight).toBe(0.25)
      world.history.undo()
      expect(deepClone(unwrap(world.flame))).toEqual(
        deepClone(examples.example1),
      )
      dispose()
    })
  })

  it('replays a weight from 0 to 1 and refuses anything else', () => {
    const partner = deepClone(examples.example2)
    expect(preflightReplayCommand('flame.setBlendFlame', [partner])).toBe(
      undefined,
    )
    expect(preflightReplayCommand('flame.setBlendFlame', [null])).toBe(
      undefined,
    )
    expect(
      preflightReplayCommand('flame.setBlendFlame', [partner, 0.4]),
    ).toBeUndefined()
    expect(
      preflightReplayCommand('flame.setBlendFlame', [partner, 1.5]),
    ).toBeDefined()
    expect(
      preflightReplayCommand('flame.setBlendFlame', [partner, '0.4']),
    ).toBeDefined()
    expect(
      preflightReplayCommand('flame.setBlendFlame', [partner, 0.4, 1]),
    ).toBeDefined()
  })

  // The shape of the take that reported this: a few edits, a partner picked
  // from the gallery at 0:43 while the preview showed it at 40%, then camera
  // moves. A take from before picks carried their weight has the one-argument
  // step, and has to replay to the blend the viewer saw rather than to the
  // weight its baseline happened to have (none, which renders as 0%).
  it('replays a take recorded before picks carried a weight at the weight the viewer saw', () => {
    createRoot((dispose) => {
      const session: RecordedSession = {
        version: SESSION_FORMAT_VERSION,
        app: { version: '0.9.12', flameSchemaVersion: '1.0' },
        createdAt: '2026-09-22T20:36:00.000Z',
        initial: deepClone(examples.example1),
        actions: [
          {
            t: 26_638,
            id: 'flame.setRenderSetting',
            args: ['camera.zoom', 0.965],
          },
          {
            t: 43_022,
            id: 'flame.setBlendFlame',
            args: [deepClone(examples.example2)],
            label: 'Set Blend Flame',
          },
          {
            t: 43_546,
            id: 'flame.setRenderSetting',
            args: ['camera.zoom', 0.715],
          },
        ],
        unnamedWriteCount: 1,
      }
      const world = makeWorld(examples.initExample)
      const replayed = replaySessionInstant(session, {
        loadInitial: (flame) => {
          world.history.replace(flame, 'Replay: initial state')
        },
        execute: (id, args) => executeReplayCommand(id, world.ctx, ...args),
      })
      expect(replayed).toBe(true)
      expect(world.flame.renderSettings.blendFlame).toBeDefined()
      expect(world.flame.renderSettings.blendWeight).toBe(DEFAULT_BLEND_WEIGHT)
      dispose()
    })
  })
})
