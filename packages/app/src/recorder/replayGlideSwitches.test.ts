import '@/commands/builtins'
import { createRoot } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeCommand, executeReplayCommand } from '@/commands/registry'
import { createPortalDriver } from '@/components/Home/portalScript'
import { examples } from '@/flame/examples'
import { createGlideRuntime, glideEnabled, glideQualityPreference, restoreGlideSwitches, setGlideRuntime, } from '@/flame/glide/runtime'
import { createSeat } from '@/seats/seat'
import { deepClone } from '@/utils/clone'
import { createSessionPlayer, MIN_STEP_GAP_MS } from './player'
import { cancelSessionRecording, getLiveWorkspaceMutationGeneration, lastFinishedSession, startSessionRecording, stopSessionRecording, } from './recorder'
import { createReplayVideoDriver } from './replayVideo'
import { SESSION_FORMAT_VERSION } from './schema'
import { replaySessionHeadless } from './synthesize/replaySandbox'
import type { ReplayTarget } from './replay'
import type { RecordedAction, RecordedSession } from './schema'
import type { CommandContext } from '@/commands/types'

/**
 * A take may flip the Glide switches (`glide.setEnabled`, `glide.setQuality`).
 * While it replays they follow the take; when the replay ends, however it
 * ends, they are the viewer's again, with any the viewer flipped meanwhile
 * kept as they flipped them. Worlds apart from the workspace (the artwork
 * export, the synthesize sandbox) never touch them, nor the live glide.
 */

const VIEWER = { enabled: false, quality: 'balanced' } as const

function makeSession(actions: RecordedAction[]): RecordedSession {
  return {
    version: SESSION_FORMAT_VERSION,
    app: { version: 'test', flameSchemaVersion: '1.0' },
    createdAt: new Date(0).toISOString(),
    initial: deepClone(examples.example1),
    actions,
    unnamedWriteCount: 0,
  }
}

/** Glide on, full quality, then one more step the replay can stop or fail on. */
const take = makeSession([
  { t: 0, id: 'glide.setEnabled', args: [true] },
  { t: 1000, id: 'glide.setQuality', args: ['full'] },
  { t: 2000, id: 'glide.setQuality', args: ['responsive'] },
])

const switches = () => ({
  enabled: glideEnabled(),
  quality: glideQualityPreference(),
})

/** The viewer runs a switch command live, through their own agent. */
function flipAsViewer(id: string, value: unknown) {
  executeCommand(id, {} as CommandContext, value)
}

/** A workspace-shaped target whose commands reach the live switches. */
function makeTarget(failOn?: number) {
  const ctx = {} as CommandContext
  let takeover: (() => void) | undefined
  let executed = 0
  let loaded = 0
  const target: ReplayTarget = {
    loadInitial: () => {
      loaded++
    },
    execute: (id, args) => {
      if (executed++ === failOn) throw new Error('boom')
      return executeReplayCommand(id, ctx, ...args)
    },
    beginBatch: (onTakeover) => {
      takeover = onTakeover
    },
    endBatch: () => {
      takeover = undefined
    },
  }
  return { target, takeOver: () => takeover?.(), loaded: () => loaded }
}

/** Run the replay to the moment step `index` has applied. */
function playTo(index: number) {
  vi.advanceTimersByTime(0)
  for (let step = 0; step < index; step++) vi.advanceTimersByTime(1000)
}

beforeEach(() => {
  vi.useFakeTimers()
  restoreGlideSwitches(VIEWER)
})
afterEach(() => {
  cancelSessionRecording()
  vi.useRealTimers()
  restoreGlideSwitches({ enabled: false, quality: 'auto' })
})

describe('the replay player and the Glide switches', () => {
  it('follows the take while it plays and hands them back when it finishes', () => {
    createRoot((dispose) => {
      const player = createSessionPlayer(take, makeTarget().target)
      player.play()
      playTo(1)
      expect(switches()).toEqual({ enabled: true, quality: 'full' })
      vi.advanceTimersByTime(5000)
      expect(player.isFinished()).toBe(true)
      expect(switches()).toEqual(VIEWER)
      dispose()
    })
  })

  it('hands them back when the replay is closed midway', () => {
    createRoot((dispose) => {
      const player = createSessionPlayer(take, makeTarget().target)
      player.play()
      playTo(1)
      player.stop()
      expect(switches()).toEqual(VIEWER)
      dispose()
    })
  })

  it('hands them back when a step fails', () => {
    createRoot((dispose) => {
      const errors: string[] = []
      const player = createSessionPlayer(take, makeTarget(2).target, {
        onError: (message) => errors.push(message),
      })
      player.play()
      playTo(2)
      expect(errors).toEqual(['Step 3 could not be replayed: boom'])
      expect(switches()).toEqual(VIEWER)
      dispose()
    })
  })

  it('hands them back when the viewer takes the document over', () => {
    createRoot((dispose) => {
      const { target, takeOver } = makeTarget()
      const player = createSessionPlayer(take, target)
      player.play()
      playTo(1)
      takeOver()
      expect(player.isPlaying()).toBe(false)
      expect(switches()).toEqual(VIEWER)
      dispose()
    })
  })

  it("keeps the take's switches over a replay Pause, until the replay ends", () => {
    createRoot((dispose) => {
      const player = createSessionPlayer(take, makeTarget().target)
      player.play()
      playTo(1)
      player.pause()
      expect(switches()).toEqual({ enabled: true, quality: 'full' })
      // Resume carries on with them, and still owes the viewer theirs.
      player.play()
      expect(switches()).toEqual({ enabled: true, quality: 'full' })
      vi.advanceTimersByTime(MIN_STEP_GAP_MS * 3)
      expect(player.isFinished()).toBe(true)
      expect(switches()).toEqual(VIEWER)
      dispose()
    })
  })

  it('keeps a switch the viewer flips while paused, though the take flips it again', () => {
    createRoot((dispose) => {
      const player = createSessionPlayer(take, makeTarget().target)
      player.play()
      playTo(1)
      player.pause()
      flipAsViewer('glide.setQuality', 'auto')
      // A flip is no edit: Resume carries on from the paused step, and the
      // take's next step switches quality again.
      player.play()
      vi.advanceTimersByTime(0)
      expect(player.stepIndex()).toBe(1)
      expect(switches()).toEqual({ enabled: true, quality: 'auto' })
      vi.advanceTimersByTime(1000)
      expect(player.isFinished()).toBe(true)
      // Their flip is their setting now; what the take switched goes back.
      expect(switches()).toEqual({ enabled: false, quality: 'auto' })
      dispose()
    })
  })

  it.each([
    ['glide.setEnabled', true],
    ['glide.setQuality', 'responsive'],
  ])('resumes a paused replay where it paused after a live %s', (id, value) => {
    createRoot((dispose) => {
      const { target, loaded } = makeTarget()
      const player = createSessionPlayer(take, target)
      player.play()
      playTo(1)
      player.pause()
      const edits = getLiveWorkspaceMutationGeneration()
      flipAsViewer(id, value)
      // It changes no document, so it is not the viewer taking over.
      expect(getLiveWorkspaceMutationGeneration()).toBe(edits)
      player.play()
      vi.advanceTimersByTime(0)
      expect(loaded()).toBe(1)
      expect(player.stepIndex()).toBe(1)
      vi.advanceTimersByTime(1000)
      expect(player.stepIndex()).toBe(2)
      expect(player.isFinished()).toBe(true)
      dispose()
    })
  })

  it('seeks forward from a paused replay after a live flip without a rebuild', () => {
    createRoot((dispose) => {
      const { target, loaded } = makeTarget()
      const player = createSessionPlayer(take, target)
      player.play()
      playTo(0)
      player.pause()
      flipAsViewer('glide.setQuality', 'auto')
      player.seek(2)
      expect(loaded()).toBe(1)
      expect(player.stepIndex()).toBe(2)
      player.stop()
      // The take switched quality twice after the flip; the flip is kept.
      expect(switches()).toEqual({ enabled: false, quality: 'auto' })
      dispose()
    })
  })

  it('keeps the last finished take on the document it describes', () => {
    startSessionRecording(deepClone(examples.example1))
    flipAsViewer('glide.setEnabled', true)
    const recorded = stopSessionRecording()
    expect(recorded?.actions.map((action) => action.id)).toEqual([
      'glide.setEnabled',
    ])
    flipAsViewer('glide.setQuality', 'full')
    flipAsViewer('glide.setEnabled', false)
    expect(lastFinishedSession()).toBe(recorded)
  })

  it("names the viewer's own switches for an export, whatever the take holds", () => {
    createRoot((dispose) => {
      const player = createSessionPlayer(take, makeTarget().target)
      expect(player.viewerGlideSwitches()).toEqual(VIEWER)
      player.play()
      playTo(1)
      player.pause()
      expect(switches()).toEqual({ enabled: true, quality: 'full' })
      expect(player.viewerGlideSwitches()).toEqual(VIEWER)
      flipAsViewer('glide.setQuality', 'auto')
      expect(player.viewerGlideSwitches()).toEqual({
        enabled: false,
        quality: 'auto',
      })
      player.stop()
      dispose()
    })
  })

  it('still rebuilds a paused replay after a live edit', () => {
    createRoot((dispose) => {
      const { target, loaded } = makeTarget()
      const player = createSessionPlayer(take, target)
      player.play()
      playTo(1)
      player.pause()
      executeCommand(
        'sidebar.open',
        { sidebar: { setOpen: () => true } } as never,
        true,
      )
      player.play()
      expect(loaded()).toBe(2)
      expect(player.stepIndex()).toBe(-1)
      player.stop()
      dispose()
    })
  })

  it('keeps the switch the viewer flips and puts back the one they left', () => {
    createRoot((dispose) => {
      const qualityFirst = makeSession([
        { t: 0, id: 'glide.setQuality', args: ['full'] },
        { t: 1000, id: 'glide.setEnabled', args: [true] },
        { t: 2000, id: 'glide.setEnabled', args: [false] },
      ])
      const player = createSessionPlayer(qualityFirst, makeTarget().target)
      player.play()
      playTo(0)
      player.pause()
      flipAsViewer('glide.setEnabled', true)
      player.play()
      vi.advanceTimersByTime(MIN_STEP_GAP_MS * 4)
      expect(player.isFinished()).toBe(true)
      expect(switches()).toEqual({ enabled: true, quality: 'balanced' })
      dispose()
    })
  })

  it("keeps the viewer's flip through a seek that rebuilds the take", () => {
    createRoot((dispose) => {
      const player = createSessionPlayer(take, makeTarget().target)
      player.seek(1)
      flipAsViewer('glide.setQuality', 'auto')
      // Backwards: the take starts again from the viewer's switches, flip
      // included, and its steps up to the seek point switch them again.
      player.seek(0)
      expect(switches()).toEqual({ enabled: true, quality: 'auto' })
      player.seek(2)
      expect(switches()).toEqual({ enabled: true, quality: 'responsive' })
      player.stop()
      expect(switches()).toEqual({ enabled: false, quality: 'auto' })
      dispose()
    })
  })

  // The viewer's live command, wired to the takeover hook the workspace gives
  // it: any command but a Glide switch hands a playing replay back first.
  const liveCtx = (takeOver: () => void) =>
    ({
      beforeCommand: takeOver,
      modal: { open: () => {} },
    }) as unknown as CommandContext

  it.each([
    ['glide.setQuality', 'auto', { enabled: false, quality: 'auto' }],
    ['glide.setEnabled', false, VIEWER],
  ] as const)(
    'plays on through a live %s, and keeps the flip',
    (id, value, after) => {
      createRoot((dispose) => {
        const { target, takeOver, loaded } = makeTarget()
        const player = createSessionPlayer(take, target)
        player.play()
        playTo(1)
        executeCommand(id, liveCtx(takeOver), value)
        expect(player.isPlaying()).toBe(true)
        vi.advanceTimersByTime(1000)
        expect(player.stepIndex()).toBe(2)
        vi.advanceTimersByTime(5000)
        expect(player.isFinished()).toBe(true)
        expect(loaded()).toBe(1)
        expect(switches()).toEqual(after)
        dispose()
      })
    },
  )

  it.each(['export.png', 'export.animation'])(
    'still hands a playing replay back to open %s',
    (id) => {
      createRoot((dispose) => {
        const { target, takeOver } = makeTarget()
        const player = createSessionPlayer(take, target)
        player.play()
        playTo(1)
        executeCommand(id, liveCtx(takeOver))
        expect(player.isPlaying()).toBe(false)
        expect(switches()).toEqual(VIEWER)
        dispose()
      })
    },
  )

  it('sets them as the take had them at the step a seek lands on', () => {
    createRoot((dispose) => {
      const player = createSessionPlayer(take, makeTarget().target)
      player.seek(2)
      expect(switches()).toEqual({ enabled: true, quality: 'responsive' })
      player.seek(0)
      expect(switches()).toEqual({ enabled: true, quality: 'balanced' })
      player.seek(-1)
      expect(switches()).toEqual(VIEWER)
      player.seek(1)
      player.stop()
      expect(switches()).toEqual(VIEWER)
      dispose()
    })
  })
})

/** A glide into another flame: the step that reaches for a glide runtime. */
const glideTake = makeSession([
  { t: 0, id: 'glide.toFlame', args: [deepClone(examples.example2), 1200] },
])

/** The live canvas's glide runtime, watched: what a replay world must not
 *  settle, start, or write through. */
function watchLiveGlide() {
  const writeFlame = vi.fn()
  const live = createGlideRuntime({
    readFlame: () => deepClone(examples.example3),
    writeFlame,
    requestFrame: () => 0,
    cancelFrame: () => {},
  })
  const settle = vi.spyOn(live, 'settleForNextChange')
  const glideFrom = vi.spyOn(live, 'glideFrom')
  setGlideRuntime(live)
  const calls = () => ({
    settle: settle.mock.calls.length,
    glideFrom: glideFrom.mock.calls.length,
    writes: writeFlame.mock.calls.length,
  })
  const dispose = () => {
    setGlideRuntime(undefined)
  }
  return { calls, dispose }
}

describe('replay worlds apart from the workspace', () => {
  it('never reaches the live glide while the artwork export glides into a flame', () => {
    const live = watchLiveGlide()
    const driver = createReplayVideoDriver(glideTake)
    const settled = driver.advanceTo(0).flame
    // The export still glides, on a plan of its own.
    const midway = driver.advanceTo(0, 0.5).flame
    live.dispose()
    expect(live.calls()).toEqual({ settle: 0, glideFrom: 0, writes: 0 })
    expect(settled.transforms).toEqual(
      replaySessionHeadless(glideTake)?.transforms,
    )
    expect(midway).not.toEqual(settled)
  })

  it('never reaches it while the synthesize sandbox checks the take', () => {
    const live = watchLiveGlide()
    const flame = replaySessionHeadless(glideTake)
    live.dispose()
    expect(live.calls()).toEqual({ settle: 0, glideFrom: 0, writes: 0 })
    expect(flame?.transforms).toEqual(deepClone(examples.example2).transforms)
  })

  it("leaves the viewer's switches alone while the artwork export replays", () => {
    const driver = createReplayVideoDriver(take)
    driver.advanceTo(take.actions.length - 1)
    expect(switches()).toEqual(VIEWER)
  })

  it('leaves them alone while the synthesize sandbox checks a take', () => {
    expect(replaySessionHeadless(take)).toBeDefined()
    expect(switches()).toEqual(VIEWER)
  })

  /** A command context with a canvas of its own and no Glide of its own. */
  const apart = {
    'a duel seat': () => {
      const seat = createSeat('rival', deepClone(examples.example1))
      return {
        run: (id: string, ...args: unknown[]) => {
          executeCommand(id, seat.ctx, ...args)
        },
        flame: () => seat.flame(),
        dispose: () => {
          seat.dispose()
        },
      }
    },
    'the Home portal': () =>
      createRoot((dispose) => {
        const driver = createPortalDriver(examples.example1)
        return {
          run: driver.ctx.executeCommand,
          flame: () => driver.flame,
          dispose,
        }
      }),
  }

  it.each(Object.keys(apart) as (keyof typeof apart)[])(
    'never reaches the live glide or switches through %s',
    (name) => {
      const live = watchLiveGlide()
      const world = apart[name]()
      world.run('glide.setEnabled', true)
      world.run('glide.setQuality', 'full')
      world.run('glide.toFlame', deepClone(examples.example2), 1200)
      live.dispose()
      expect(live.calls()).toEqual({ settle: 0, glideFrom: 0, writes: 0 })
      expect(switches()).toEqual(VIEWER)
      // The step still lands on its flame, in one move.
      expect(Object.keys(world.flame().transforms)).toEqual(
        Object.keys(examples.example2.transforms),
      )
      world.dispose()
    },
  )
})
