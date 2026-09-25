/**
 * Every command that writes a bounded render setting lands a value the flame
 * schema accepts, and records that value, not the one it was asked for.
 *
 * The domain is the schema's own (numberDomain.ts): an integer setting is
 * floored, every bounded one is clamped at both ends, and palettePhase, the
 * one cyclic setting, wraps. A fraction or an out-of-range number reaches
 * these commands from an agent, a hand-edited take or an internal caller; the
 * sliders never send one.
 */
import '@/commands/builtins'
import { createRoot } from 'solid-js'
import { createStore } from 'solid-js/store'
import { afterEach, describe, expect, it } from 'vitest'
import { executeCommand, executeReplayCommand, preflightLiveCommand, } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { createSeatCommandContext } from '@/seats/seat'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { createTimelineState } from '@/utils/timeline'

type Read = (settings: Record<string, unknown>) => unknown

type Case = {
  name: string
  id: string
  args: unknown[]
  read: Read
  applied: unknown
  /** The args a take holds for it, when they differ from `args`. */
  recorded: unknown[]
}

const field =
  (key: string): Read =>
  (settings) =>
    settings[key]
const zoom: Read = (settings) =>
  (settings.camera as { zoom: number } | undefined)?.zoom

function setting(
  path: string,
  read: Read,
  value: unknown,
  applied: unknown,
): Omit<Case, 'name'> {
  return {
    id: 'flame.setRenderSetting',
    args: [path, value],
    read,
    applied,
    recorded: [path, applied],
  }
}

function scalar(
  id: string,
  read: Read,
  value: number,
  applied: number,
): Omit<Case, 'name'> {
  return { id, args: [value], read, applied, recorded: [applied] }
}

const CASES: Case[] = Object.entries({
  'setSkipIters floors a fraction': scalar(
    'flame.setSkipIters',
    field('skipIters'),
    7.9,
    7,
  ),
  'setSkipIters clamps below': scalar(
    'flame.setSkipIters',
    field('skipIters'),
    -3,
    0,
  ),
  'setSkipIters clamps above': scalar(
    'flame.setSkipIters',
    field('skipIters'),
    60,
    50,
  ),
  'setRenderSetting floors skipIters': setting(
    'skipIters',
    field('skipIters'),
    7.9,
    7,
  ),
  'setRenderSetting clamps skipIters below': setting(
    'skipIters',
    field('skipIters'),
    -3,
    0,
  ),
  'setRenderSetting clamps skipIters above': setting(
    'skipIters',
    field('skipIters'),
    60,
    50,
  ),
  'setRenderSetting wraps palettePhase above': setting(
    'palettePhase',
    field('palettePhase'),
    1.25,
    0.25,
  ),
  'setRenderSetting wraps palettePhase below': setting(
    'palettePhase',
    field('palettePhase'),
    -0.25,
    0.75,
  ),
  'setRenderSetting clamps gamma below': setting(
    'gamma',
    field('gamma'),
    0,
    0.1,
  ),
  'setRenderSetting clamps gamma above': setting(
    'gamma',
    field('gamma'),
    99,
    8,
  ),
  'setRenderSetting clamps each background channel': setting(
    'backgroundColor',
    field('backgroundColor'),
    [2, -1, 0.5],
    [1, 0, 0.5],
  ),
  'setRenderSetting clamps camera.zoom': setting(
    'camera.zoom',
    zoom,
    9000,
    500,
  ),
  'setRenderSetting clamps zoom inside a camera object': {
    id: 'flame.setRenderSetting',
    args: ['camera', { zoom: 9000 }],
    read: zoom,
    applied: 500,
    recorded: ['camera', { zoom: 500 }],
  },
  'setRenderSetting leaves an in-domain value as it is': setting(
    'gamma',
    field('gamma'),
    2.5,
    2.5,
  ),
  'setExposure clamps below': scalar(
    'flame.setExposure',
    field('exposure'),
    -20,
    -8,
  ),
  'setExposure clamps above': scalar(
    'flame.setExposure',
    field('exposure'),
    20,
    8,
  ),
  'setVibrancy clamps below': scalar(
    'flame.setVibrancy',
    field('vibrancy'),
    -1,
    0,
  ),
  'setVibrancy clamps above': scalar(
    'flame.setVibrancy',
    field('vibrancy'),
    9,
    3,
  ),
  'setGamma clamps below': scalar('flame.setGamma', field('gamma'), 0, 0.1),
  'setGamma clamps above': scalar('flame.setGamma', field('gamma'), 99, 8),
  'setContrast clamps below': scalar(
    'flame.setContrast',
    field('contrast'),
    0,
    0.01,
  ),
  'setContrast clamps above': scalar(
    'flame.setContrast',
    field('contrast'),
    99,
    20,
  ),
  'setBlendWeight clamps below': scalar(
    'flame.setBlendWeight',
    field('blendWeight'),
    -0.5,
    0,
  ),
  'setBlendWeight clamps above': scalar(
    'flame.setBlendWeight',
    field('blendWeight'),
    1.5,
    1,
  ),
  'setBlendFlame clamps the weight it names': {
    id: 'flame.setBlendFlame',
    args: [examples.example2, 1.5],
    read: field('blendWeight'),
    applied: 1,
    recorded: [examples.example2, 1],
  },
  'setBackgroundColor clamps each channel': {
    id: 'flame.setBackgroundColor',
    args: [2, -1, 0.5],
    read: field('backgroundColor'),
    applied: [1, 0, 0.5],
    recorded: [1, 0, 0.5],
  },
}).map(([name, rest]) => ({ name, ...rest }))

function withWorld(run: (world: ReturnType<typeof makeWorld>) => void) {
  createRoot((dispose) => {
    run(makeWorld())
    dispose()
  })
}

function makeWorld() {
  const [flame, setFlame, history] = createStoreHistory(
    createStore(deepClone(examples.example1)),
    { journal: true },
  )
  const ctx = createSeatCommandContext({
    flame: () => flame,
    setFlame,
    timeline: createTimelineState(),
    history,
  })
  const settings = () =>
    flame.renderSettings as unknown as Record<string, unknown>
  return { flame, ctx, settings }
}

describe('commands hold render settings to the schema domain', () => {
  afterEach(cancelSessionRecording)

  it.each(CASES)('$name', ({ id, args, read, applied, recorded }) => {
    withWorld((world) => {
      expect(startSessionRecording(examples.example1)).toEqual({ ok: true })
      executeCommand(id, world.ctx, ...args)
      const session = stopSessionRecording()

      expect(read(world.settings())).toEqual(applied)
      expect(tryValidateFlame(deepClone(world.flame))).toBeTruthy()
      // A take replays what was applied, not what was asked for.
      expect(session?.actions.map((action) => action.args)).toEqual([recorded])
    })
  })

  it.each(CASES)('$name for an agent', ({ id, args, recorded }) => {
    withWorld((world) => {
      expect(preflightLiveCommand(id, world.ctx, args)).toEqual({
        args: recorded,
      })
    })
  })

  it.each(CASES)(
    '$name when a hand-edited take replays it',
    ({ id, args, read, applied }) => {
      withWorld((world) => {
        const before = read(world.settings())
        // The replay policy may refuse a raw value outright, which leaves the
        // document as it was; what it lets through lands in the domain.
        const ran = executeReplayCommand(id, world.ctx, ...args)
        expect(read(world.settings())).toEqual(ran ? applied : before)
        expect(tryValidateFlame(deepClone(world.flame))).toBeTruthy()
      })
    },
  )
})
