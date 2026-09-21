// Who owns the flame while a glide is running.
//
// A glide writes a whole sampled descriptor every frame through the silent
// path, so for as long as it runs it is the document's only author. That is
// right for the transition and wrong the moment a person touches a control:
// their edit was made to the frame they could see, and a glide that keeps
// writing over it — and then lands on its own target — throws the edit away.
//
// The real history store is used here rather than a fake, because the answer
// depends on which of its write paths a caller took: `replaceSilently` is the
// glide's own and records nothing, while a gesture and a discrete edit each
// reach a different hook. The wiring below is the workspace's wiring.
import { createRoot } from 'solid-js'
import { createStore } from 'solid-js/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { createUndoRouter } from '@/utils/undoRouting'
import { createGlideRuntime, setGlideRuntime, settleGlideBeforeTimeTravel, yieldGlideToDocumentWrite, } from './runtime'
import { makeFlame } from './testUtils'
import { GLIDE_DEADLINE_SLACK_MS } from './types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineState } from '@/utils/timeline'

const A = makeFlame({
  transforms: { one: { probability: 1, preAffine: { c: 0 } } },
  renderSettings: { gamma: 2 },
})
const B = makeFlame({
  transforms: { one: { probability: 1, preAffine: { c: 4 } } },
  renderSettings: { gamma: 4 },
})

const gammaOf = (flame: FlameDescriptor) => flame.renderSettings.gamma

/** The workspace, in miniature: its history, its hooks, its glide runtime. */
function workspace(start: FlameDescriptor) {
  const [flame, setFlame, history] = createStoreHistory(
    createStore<FlameDescriptor>(deepClone(start)),
    {
      journal: true,
      // Exactly what MainWorkspace passes, minus the recorder's own reporter
      // (which is all `onEntryPushed` carries there).
      onPreviewStarted: yieldGlideToDocumentWrite,
      onBeforeDocumentWrite: yieldGlideToDocumentWrite,
      onBeforeTimeTravel: settleGlideBeforeTimeTravel,
    },
  )
  let time = 0
  let pending: ((time: number) => void)[] = []
  const runtime = createGlideRuntime({
    readFlame: () => deepClone(flame),
    writeFlame: (next) => {
      history.replaceSilently(next)
    },
    markDocumentEntry: () => history.peekUndoSeq(),
    amendDocumentEntry: (mark, recordedEnd) => {
      history.amendNewestEntry(mark, recordedEnd)
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
    flame,
    setFlame,
    history,
    runtime,
    advance: (ms: number) => {
      time += ms
      const due = pending
      pending = []
      for (const callback of due) callback(time)
    },
    dispose: () => {
      runtime.dispose()
      setGlideRuntime(undefined)
    },
  }
}

describe('a document write that arrives mid-glide', () => {
  it('cancels the transition in place when a person makes it', () => {
    createRoot((dispose) => {
      const world = workspace(A)
      world.history.replaceSilently(deepClone(B))
      void world.runtime.glideFrom(A, { durationMs: 400 })
      world.advance(200)
      const onScreen = gammaOf(world.flame)
      expect(onScreen).toBeGreaterThan(2)
      expect(onScreen).toBeLessThan(4)

      // A control the person moved, on the frame they could see. 1.25 is
      // outside the range the glide travels, so it can never be mistaken for
      // a frame of the transition.
      world.setFlame((draft) => {
        draft.renderSettings.gamma = 1.25
      }, 'Set gamma')

      expect(world.runtime.isGliding()).toBe(false)
      world.advance(400)
      expect(gammaOf(world.flame)).toBe(1.25)

      world.dispose()
      dispose()
    })
  })

  it('cancels on the gesture, before the drag has written anything', () => {
    createRoot((dispose) => {
      const world = workspace(A)
      world.history.replaceSilently(deepClone(B))
      void world.runtime.glideFrom(A, { durationMs: 400 })
      world.advance(200)

      // Pointer-down on a slider: the gesture opens before its first write.
      world.history.startPreview('Set gamma')
      expect(world.runtime.isGliding()).toBe(false)

      world.setFlame((draft) => {
        draft.renderSettings.gamma = 1.25
      })
      world.history.commit()
      world.advance(400)
      expect(gammaOf(world.flame)).toBe(1.25)

      world.dispose()
      dispose()
    })
  })

  it('undo puts back the frame the edit was made on, never the target', () => {
    createRoot((dispose) => {
      const world = workspace(A)
      world.history.replaceSilently(deepClone(B))
      void world.runtime.glideFrom(A, { durationMs: 400 })
      world.advance(200)
      const onScreen = deepClone(world.flame)

      world.setFlame((draft) => {
        draft.renderSettings.gamma = 1.25
      }, 'Set gamma')
      world.advance(400)
      world.history.undo()

      // The glide never became an undo step, so undoing the edit restores
      // what the person was looking at when they made it — not `B`, which is
      // where the transition was heading and which nobody ever saw.
      expect(world.flame).toEqual(onScreen)
      expect(gammaOf(world.flame)).not.toBe(4)

      world.dispose()
      dispose()
    })
  })

  it('ignores the glide runtime writing its own frames', () => {
    createRoot((dispose) => {
      const world = workspace(A)
      world.history.replaceSilently(deepClone(B))
      void world.runtime.glideFrom(A, { durationMs: 400 })
      world.advance(100)
      expect(world.runtime.isGliding()).toBe(true)
      world.advance(100)
      expect(world.runtime.isGliding()).toBe(true)
      world.advance(200)
      // Ran to its own end and landed on exactly the target.
      expect(world.flame).toEqual(B)

      world.dispose()
      dispose()
    })
  })
})

/**
 * The whole undo walk after a transition was cut short.
 *
 * One undo restoring the interrupted frame is not enough on its own: the
 * entries under it were recorded against states the document never reached, so
 * every step of the walk has to be checked against the flame it claims to
 * restore — exactly, because "close enough" in a document means a flame the
 * person did not ask for.
 */
describe('the history walk after an interrupted transition', () => {
  const START = makeFlame({
    transforms: { one: { probability: 1, preAffine: { c: 0 } } },
    renderSettings: { gamma: 2 },
  })
  /** Scalar and affine only: the two documents have the same shape. */
  const MOVED = makeFlame({
    transforms: { one: { probability: 1, preAffine: { c: 4 } } },
    renderSettings: { gamma: 3 },
  })
  /** Structural: a transform the other side does not have at all, which the
   *  planner carries as a union member rising from probability zero. */
  const GREW = makeFlame({
    transforms: {
      one: { probability: 0.5, preAffine: { c: 4 } },
      two: { probability: 0.5, preAffine: { c: -2 } },
    },
    renderSettings: { gamma: 3 },
  })

  function interruptedWalk(second: FlameDescriptor) {
    const world = workspace(START)
    // E1 and E2, the two entries the walk unwinds.
    world.history.replace(deepClone(START), 'First')
    const first = deepClone(world.flame)
    world.history.replace(deepClone(second), 'Second')

    // E2 is presented as a transition, and interrupted half way through it.
    void world.runtime.glideFrom(first, { durationMs: 400 })
    world.advance(200)
    const interrupted = deepClone(world.flame)
    expect(world.runtime.isGliding()).toBe(true)

    // E3: the edit that cut it short, made on the frame that was on screen.
    world.setFlame((draft) => {
      draft.renderSettings.gamma = 1.25
    }, 'Third')
    world.advance(400)
    const edited = deepClone(world.flame)
    expect(world.runtime.isGliding()).toBe(false)

    return { world, first, interrupted, edited }
  }

  it('walks back and forward through a scalar transition, exactly', () => {
    createRoot((dispose) => {
      const { world, first, interrupted, edited } = interruptedWalk(MOVED)

      world.history.undo()
      expect(world.flame).toEqual(interrupted)
      world.history.undo()
      expect(world.flame).toEqual(first)

      world.history.redo()
      expect(world.flame).toEqual(interrupted)
      world.history.redo()
      expect(world.flame).toEqual(edited)

      world.dispose()
      dispose()
    })
  })

  it('walks back and forward through a structural transition, exactly', () => {
    createRoot((dispose) => {
      const { world, first, interrupted, edited } = interruptedWalk(GREW)

      world.history.undo()
      expect(world.flame).toEqual(interrupted)
      world.history.undo()
      expect(world.flame).toEqual(first)

      world.history.redo()
      expect(world.flame).toEqual(interrupted)
      world.history.redo()
      expect(world.flame).toEqual(edited)

      world.dispose()
      dispose()
    })
  })

  it('refuses an entry that does not end where the transition was heading', () => {
    createRoot((dispose) => {
      const world = workspace(START)
      // Narrow patches, from `set` rather than a whole-document replace: an
      // entry like this rewritten against a document it never produced would
      // take the difference with it, which is why the refusal matters.
      world.setFlame((draft) => {
        draft.renderSettings.gamma = MOVED.renderSettings.gamma
        for (const transform of Object.values(draft.transforms)) {
          transform.preAffine.c = 4
        }
      }, 'Someone else')
      const seq = world.history.peekUndoSeq()

      // The state a transition with no entry of its own would be heading for:
      // a different shape, which this entry never produced and must not be
      // made to claim.
      const elsewhere = makeFlame({
        transforms: {
          one: { probability: 0.5, preAffine: { c: 9 } },
          two: { probability: 0.5, preAffine: { c: -7 } },
        },
        renderSettings: { gamma: 5 },
      })
      world.history.replaceSilently(deepClone(elsewhere))

      expect(world.history.amendNewestEntry(seq, elsewhere)).toBe(false)

      world.dispose()
      dispose()
    })
  })

  it('refuses while a replay transaction owns the document', () => {
    createRoot((dispose) => {
      const world = workspace(START)
      world.history.replace(deepClone(MOVED), 'A step')
      const seq = world.history.peekUndoSeq()

      // Replay holds its batch open across the step it is playing, and its
      // own writes are not somebody interrupting a transition.
      world.history.startOwnedPreview('Replay batch', () => {})
      expect(world.history.amendNewestEntry(seq, deepClone(MOVED))).toBe(false)

      world.dispose()
      dispose()
    })
  })

  it('refuses an entry that has a redo stacked on it', () => {
    createRoot((dispose) => {
      const world = workspace(START)
      world.history.replace(deepClone(MOVED), 'A step')
      world.history.replace(deepClone(GREW), 'A shape change')
      // Back onto the first step, with the second waiting in the redos. Its
      // forward patches were computed against this entry's end, so rewriting
      // that end would leave the redo describing a document that no longer
      // exists.
      world.history.undo()

      expect(
        world.history.amendNewestEntry(
          world.history.peekUndoSeq(),
          deepClone(MOVED),
        ),
      ).toBe(false)

      world.dispose()
      dispose()
    })
  })

  it('refuses when the entry it marked has been replaced', () => {
    createRoot((dispose) => {
      const world = workspace(START)
      world.history.replace(deepClone(MOVED), 'A step')
      world.history.replace(deepClone(GREW), 'A shape change')
      const seq = world.history.peekUndoSeq()
      world.history.undo()
      // Undone and then written over: a different action, which the stamp is
      // the only thing that can tell apart from the one that was marked,
      // because it happens to end in the same place.
      world.history.replace(deepClone(GREW), 'Another road to the same flame')

      expect(world.history.amendNewestEntry(seq, deepClone(GREW))).toBe(false)

      world.dispose()
      dispose()
    })
  })
})

/**
 * Undo and redo, while a transition is running.
 *
 * Time travel is a change like any other, so it settles first: the entry the
 * stack is about to unwind was recorded as ending on the settle, and a
 * backward patch applied to a half-interpolated frame is only as exact as the
 * patch model. Cancelling in place instead would leave the document on a frame
 * no entry describes; leaving the transition running would be worse still —
 * the next frame writes over the undone document and the settle then lands the
 * undone entry's state while the stack says otherwise.
 */
describe('time travel while a transition is running', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('settles before an undo, so the undo lands exactly on the old flame', () => {
    createRoot((dispose) => {
      const world = workspace(A)
      world.history.replace(deepClone(B), 'Set gamma')
      void world.runtime.glideFrom(A, { durationMs: 400 })
      world.advance(200)
      expect(world.runtime.isGliding()).toBe(true)

      world.history.undo()

      expect(world.runtime.isGliding()).toBe(false)
      expect(world.flame).toEqual(A)
      // And nothing arrives afterwards to move it off what undo restored.
      world.advance(400)
      expect(world.flame).toEqual(A)

      world.dispose()
      dispose()
    })
  })

  it('settles before a redo, so the redo lands exactly on the new flame', () => {
    createRoot((dispose) => {
      const world = workspace(A)
      world.history.replace(deepClone(B), 'Set gamma')
      world.history.undo()
      // The undo itself animated: a transition from what was on screen back to
      // the restored document, still running when redo is pressed.
      void world.runtime.glideFrom(B, { durationMs: 400 })
      world.advance(200)
      expect(world.runtime.isGliding()).toBe(true)

      world.history.redo()

      expect(world.runtime.isGliding()).toBe(false)
      expect(world.flame).toEqual(B)
      world.advance(400)
      expect(world.flame).toEqual(B)

      world.dispose()
      dispose()
    })
  })

  it('takes the deadline with it, in a tab that never animated', () => {
    vi.useFakeTimers()
    createRoot((dispose) => {
      const world = workspace(A)
      world.history.replace(deepClone(B), 'Set gamma')
      // Not one frame: only the wall-clock deadline is pending.
      void world.runtime.glideFrom(A, { durationMs: 400 })

      world.history.undo()
      expect(world.flame).toEqual(A)

      vi.advanceTimersByTime(400 + GLIDE_DEADLINE_SLACK_MS + 50)
      expect(world.flame).toEqual(A)

      world.dispose()
      dispose()
    })
  })

  it('leaves the transition alone when there is nothing to undo', () => {
    createRoot((dispose) => {
      const world = workspace(A)
      // Silent, so the stack stays empty: the keystroke reaches the history
      // and finds no entry to apply. A time travel that does not happen is no
      // reason to end what is on screen.
      world.history.replaceSilently(deepClone(B))
      void world.runtime.glideFrom(A, { durationMs: 400 })
      world.advance(200)

      world.history.undo()
      world.history.redo()

      expect(world.runtime.isGliding()).toBe(true)
      expect(gammaOf(world.flame)).toBeLessThan(4)

      world.dispose()
      dispose()
    })
  })

  it('leaves the transition alone when the undo belongs to the timeline', () => {
    createRoot((dispose) => {
      const world = workspace(A)
      world.history.replace(deepClone(B), 'Set gamma')
      void world.runtime.glideFrom(A, { durationMs: 400 })
      world.advance(200)

      let timelineUndos = 0
      const timeline = {
        timelineUndo: () => {
          timelineUndos++
        },
        timelineRedo: () => {},
        hasTimelineUndo: () => true,
        hasTimelineRedo: () => false,
        // More recent than anything the flame history holds, so the router
        // sends this undo to the timeline and the flame is not involved.
        peekUndoSeq: () => Number.MAX_SAFE_INTEGER,
        peekRedoSeq: () => null,
      } as unknown as TimelineState
      const router = createUndoRouter(world.history, timeline)

      expect(router.undoLast()).toBe(true)
      expect(timelineUndos).toBe(1)
      expect(world.runtime.isGliding()).toBe(true)

      world.dispose()
      dispose()
    })
  })
})
