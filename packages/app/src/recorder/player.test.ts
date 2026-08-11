import '@/commands/builtins'
import { createRoot, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { createSessionPlayer, MAX_STEP_GAP_MS } from './player'
import { SESSION_FORMAT_VERSION } from './schema'
import type { RecordedAction, RecordedSession } from './schema'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * The replay transport (semantic-recorder-plan, M4). Two properties matter
 * beyond "it applies the actions": a run collapses into ONE undo step, so
 * watching a session does not bury the viewer's own history; and seeking
 * backwards rebuilds from the initial flame rather than trying to undo.
 */

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

const gammaSteps = makeSession([
  { t: 0, id: 'flame.setGamma', args: [1.5], label: 'Set Gamma' },
  { t: 100, id: 'flame.setGamma', args: [2.5], label: 'Set Gamma' },
  { t: 250, id: 'flame.setGamma', args: [3.5], label: 'Set Gamma' },
])

/** A workspace-shaped target: the real history, so batching is exercised. */
function makeTarget(start: FlameDescriptor) {
  const [flame, setFlameDescriptor, history] = createStoreHistory(
    createStore<FlameDescriptor>(deepClone(start)),
    { journal: true },
  )
  const [zoom, setZoom] = createSignal(1)
  const ctx = {
    flameDescriptor: () => flame,
    setFlameDescriptor,
    zoom,
    setZoom,
  } as unknown as CommandContext
  let entries = 0
  let loads = 0
  const target = {
    loadInitial: (next: FlameDescriptor) => {
      loads++
      // Through the SETTER, not history.replace: replace pushes its own entry
      // and would escape the batch the player opened.
      setFlameDescriptor(() => deepClone(next), 'Replay: initial state')
    },
    execute: (id: string, args: unknown[]) => {
      executeCommand(id, ctx, ...args)
    },
    beginBatch: () => {
      history.startPreview('Replay')
    },
    endBatch: () => {
      if (history.isPreviewing()) {
        history.commit()
        entries++
      }
    },
  }
  return {
    flame,
    history,
    ctx,
    target,
    committed: () => entries,
    loaded: () => loads,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createSessionPlayer', () => {
  it('plays through every step, paced by the recorded gaps', () => {
    createRoot((dispose) => {
      const { flame, target } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)
      player.play()

      // The first step waits out its own offset from the session start.
      vi.advanceTimersByTime(0)
      expect(flame.renderSettings.gamma).toBeCloseTo(1.5, 5)
      expect(player.stepIndex()).toBe(0)

      vi.advanceTimersByTime(99)
      expect(player.stepIndex()).toBe(0)
      vi.advanceTimersByTime(1)
      expect(flame.renderSettings.gamma).toBeCloseTo(2.5, 5)

      vi.advanceTimersByTime(150)
      expect(flame.renderSettings.gamma).toBeCloseTo(3.5, 5)
      expect(player.isPlaying()).toBe(false)
      dispose()
    })
  })

  it('starts from the flame the session was recorded against', () => {
    createRoot((dispose) => {
      // The target holds a different flame from the session's `initial` — the
      // ordinary case: the viewer was editing something when they hit Play.
      const { flame, target } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)
      player.play()
      vi.advanceTimersByTime(0)

      // Everything the session did not touch comes from `initial`, not from
      // what happened to be on screen. Replaying onto the viewer's own flame
      // would produce a hybrid that matches neither.
      expect(flame.transforms).toEqual(examples.example1.transforms)
      expect(flame.renderSettings.gamma).toBeCloseTo(1.5, 5)
      dispose()
    })
  })

  it('collapses a whole run into one undo step', () => {
    createRoot((dispose) => {
      const { flame, history, target, committed } = makeTarget(
        examples.initExample,
      )
      const before = deepClone(flame)
      const player = createSessionPlayer(gammaSteps, target)
      player.play()
      vi.advanceTimersByTime(1000)

      expect(committed()).toBe(1)
      expect(flame.renderSettings.gamma).toBeCloseTo(3.5, 5)
      // One undo takes the viewer back to their own flame — the whole point
      // of batching, and what makes "watch it, then carry on" usable.
      history.undo()
      expect(deepClone(flame)).toEqual(before)
      dispose()
    })
  })

  it('applies a speed change from the next step onward', () => {
    createRoot((dispose) => {
      const { target } = makeTarget(examples.initExample)
      const [speed, setSpeed] = createSignal(1)
      const player = createSessionPlayer(gammaSteps, target, { speed })
      player.play()
      vi.advanceTimersByTime(0)
      expect(player.stepIndex()).toBe(0)

      // The wait for step 1 is already scheduled at the old speed, so the
      // change lands on the step after it — never more than one gap late,
      // which MAX_STEP_GAP_MS bounds.
      setSpeed(10)
      vi.advanceTimersByTime(100)
      expect(player.stepIndex()).toBe(1)

      // Step 2's 150ms gap now takes 15ms.
      vi.advanceTimersByTime(14)
      expect(player.stepIndex()).toBe(1)
      vi.advanceTimersByTime(1)
      expect(player.stepIndex()).toBe(2)
      dispose()
    })
  })

  it('clamps a long thinking pause so playback never stalls', () => {
    createRoot((dispose) => {
      const { target } = makeTarget(examples.initExample)
      const longPause = makeSession([
        { t: 0, id: 'flame.setGamma', args: [1.5] },
        { t: 5 * 60_000, id: 'flame.setGamma', args: [2.5] },
      ])
      const player = createSessionPlayer(longPause, target)
      player.play()
      vi.advanceTimersByTime(0)
      expect(player.stepIndex()).toBe(0)
      vi.advanceTimersByTime(MAX_STEP_GAP_MS)
      expect(player.stepIndex()).toBe(1)
      dispose()
    })
  })

  it('pause stops the clock and commits what was applied', () => {
    createRoot((dispose) => {
      const { flame, target, committed } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)
      player.play()
      vi.advanceTimersByTime(0)
      player.pause()

      expect(committed()).toBe(1)
      vi.advanceTimersByTime(10_000)
      expect(player.stepIndex()).toBe(0)
      expect(flame.renderSettings.gamma).toBeCloseTo(1.5, 5)
      dispose()
    })
  })

  it('seeks backwards by rebuilding from the initial flame', () => {
    createRoot((dispose) => {
      const { flame, target } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)
      player.seek(2)
      expect(flame.renderSettings.gamma).toBeCloseTo(3.5, 5)

      // Backwards is a replay of the prefix, not an undo of the difference.
      player.seek(0)
      expect(flame.renderSettings.gamma).toBeCloseTo(1.5, 5)
      expect(player.stepIndex()).toBe(0)

      // -1 is the untouched initial document.
      player.seek(-1)
      expect(deepClone(flame)).toEqual(deepClone(examples.example1))
      expect(player.stepIndex()).toBe(-1)
      dispose()
    })
  })

  it('seeks forwards by applying only the missing steps', () => {
    createRoot((dispose) => {
      const { flame, ctx, target, loaded } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)

      // The first move loads the recorded flame, whichever direction it is.
      // After that, stepping forward one at a time — the common case, from the
      // ▶| button and from clicking down the step list — applies only the
      // missing actions: rebuilding from `initial` each time would make that
      // quadratic and flicker the whole document once per step.
      player.seek(0)
      expect(loaded()).toBe(1)
      player.seek(1)
      player.seek(2)
      expect(loaded()).toBe(1)
      expect(flame.renderSettings.gamma).toBeCloseTo(3.5, 5)

      // Re-seeking the step we are on still rebuilds — that is how the viewer
      // discards edits of their own and gets the recorded state back.
      executeCommand('flame.setGamma', ctx, 9)
      player.seek(2)
      expect(loaded()).toBe(2)
      expect(flame.renderSettings.gamma).toBeCloseTo(3.5, 5)
      dispose()
    })
  })

  it('a seek is its own single undo step', () => {
    createRoot((dispose) => {
      const { target, committed } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)
      player.seek(2)
      expect(committed()).toBe(1)
      player.seek(0)
      expect(committed()).toBe(2)
      dispose()
    })
  })

  it('replaying past the end starts over rather than sitting dead', () => {
    createRoot((dispose) => {
      const { flame, target } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)
      player.seek(2)
      player.play()
      // Rewound to the initial flame, then plays forward again.
      expect(player.stepIndex()).toBe(-1)
      vi.advanceTimersByTime(1000)
      expect(player.stepIndex()).toBe(2)
      expect(flame.renderSettings.gamma).toBeCloseTo(3.5, 5)
      dispose()
    })
  })

  it('leaves the document editable after stopping (fork from a step)', () => {
    createRoot((dispose) => {
      const { flame, history, ctx, target } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)
      player.seek(1)
      player.stop()

      // No preview left open, so ordinary editing and undo work again.
      expect(history.isPreviewing()).toBe(false)
      expect(flame.renderSettings.gamma).toBeCloseTo(2.5, 5)

      // Carry on from step 1 with an edit of the viewer's own...
      executeCommand('flame.setGamma', ctx, 9)
      expect(flame.renderSettings.gamma).toBeCloseTo(9, 5)

      // ...which is its own undo step, on top of the replayed one.
      history.undo()
      expect(flame.renderSettings.gamma).toBeCloseTo(2.5, 5)
      history.undo()
      expect(deepClone(flame)).toEqual(deepClone(examples.initExample))
      dispose()
    })
  })
})

describe('authored pacing', () => {
  it('holds a step for its authored holdMs instead of the recorded gap', () => {
    createRoot((dispose) => {
      const { target } = makeTarget(examples.initExample)
      // Recorded 100ms apart, but the author wants to sit on step 0.
      const authored = makeSession([
        { t: 0, id: 'flame.setGamma', args: [1.5], holdMs: 3000 },
        { t: 100, id: 'flame.setGamma', args: [2.5] },
      ])
      const player = createSessionPlayer(authored, target)
      player.play()
      vi.advanceTimersByTime(0)
      expect(player.stepIndex()).toBe(0)

      // The recorded gap would have advanced here; the authored hold does not.
      vi.advanceTimersByTime(2999)
      expect(player.stepIndex()).toBe(0)
      vi.advanceTimersByTime(1)
      expect(player.stepIndex()).toBe(1)
      dispose()
    })
  })

  it('scales an authored hold with playback speed', () => {
    createRoot((dispose) => {
      const { target } = makeTarget(examples.initExample)
      const [speed] = createSignal(4)
      const authored = makeSession([
        { t: 0, id: 'flame.setGamma', args: [1.5], holdMs: 2000 },
        { t: 100, id: 'flame.setGamma', args: [2.5] },
      ])
      const player = createSessionPlayer(authored, target, { speed })
      player.play()
      vi.advanceTimersByTime(0)
      vi.advanceTimersByTime(500)
      expect(player.stepIndex()).toBe(1)
      dispose()
    })
  })

  it('exposes the current action so the follow-cam knows where to point', () => {
    createRoot((dispose) => {
      const { target } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)
      expect(player.currentAction()).toBeUndefined()
      player.seek(1)
      expect(player.currentAction()?.args).toEqual([2.5])
      dispose()
    })
  })
})
