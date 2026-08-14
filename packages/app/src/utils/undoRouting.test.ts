import { createStore } from 'solid-js/store'
import { beforeEach, describe, expect, it } from 'vitest'
import { createStoreHistory } from './createStoreHistory'
import { createTimelineState } from './timeline'
import { createUndoRouter } from './undoRouting'

/**
 * Cross-system undo routing contract: Ctrl+Z (and the toolbar buttons, which
 * share the router) must revert the user's LAST action regardless of which
 * system recorded it, and redo must replay forward in original order. This
 * replaces the old "drain the whole timeline stack before flame history
 * becomes reachable" behavior.
 */
describe('undo routing across flame history and timeline', () => {
  type Flame = { exposure: number; name: string }

  let timeline: ReturnType<typeof createTimelineState>
  let flame: Flame
  let setFlame: ReturnType<typeof createStoreHistory<Flame>>[1]
  let history: ReturnType<typeof createStoreHistory<Flame>>[2]
  let router: ReturnType<typeof createUndoRouter>

  const editFlame = (exposure: number) => {
    setFlame((draft) => {
      draft.exposure = exposure
    })
  }
  const addKeyframe = (frame: number, value: number) => {
    timeline.addKeyframe('exposure', frame, value, 'linear')
  }
  const keyframeCount = () =>
    timeline.tracks().find((t) => t.parameterPath === 'exposure')?.keyframes
      .length ?? 0

  beforeEach(() => {
    timeline = createTimelineState()
    const [store, set, hist] = createStoreHistory(
      createStore<Flame>({ exposure: 0, name: 'base' }),
      { journal: true },
    )
    flame = store
    setFlame = set
    history = hist
    router = createUndoRouter(history, timeline)
  })

  it('undoes in reverse chronological order across systems', () => {
    editFlame(1) // action 1 (flame)
    addKeyframe(10, 0.5) // action 2 (timeline)
    editFlame(2) // action 3 (flame)

    expect(router.undoLast()).toBe(true) // undo action 3
    expect(flame.exposure).toBe(1)
    expect(keyframeCount()).toBe(1)

    expect(router.undoLast()).toBe(true) // undo action 2
    expect(keyframeCount()).toBe(0)
    expect(flame.exposure).toBe(1)

    expect(router.undoLast()).toBe(true) // undo action 1
    expect(flame.exposure).toBe(0)
    expect(router.undoLast()).toBe(false) // nothing left
  })

  it('redoes forward in original chronological order', () => {
    editFlame(1)
    addKeyframe(10, 0.5)
    editFlame(2)
    router.undoLast()
    router.undoLast()
    router.undoLast()

    expect(router.redoLast()).toBe(true) // replay action 1 (flame)
    expect(flame.exposure).toBe(1)
    expect(keyframeCount()).toBe(0)

    expect(router.redoLast()).toBe(true) // replay action 2 (timeline)
    expect(keyframeCount()).toBe(1)

    expect(router.redoLast()).toBe(true) // replay action 3 (flame)
    expect(flame.exposure).toBe(2)
    expect(router.redoLast()).toBe(false)
  })

  it('a flame edit after undos kills timeline redo too', () => {
    addKeyframe(10, 0.5)
    router.undoLast() // timeline redo now available
    expect(timeline.hasTimelineRedo()).toBe(true)

    editFlame(7) // new edit — user changed direction
    expect(timeline.hasTimelineRedo()).toBe(false)
    expect(router.redoLast()).toBe(false)
  })

  it('a timeline write after undos kills flame redo too', () => {
    editFlame(1)
    router.undoLast()
    expect(history.hasRedo()).toBe(true)

    addKeyframe(10, 0.5)
    expect(history.hasRedo()).toBe(false)
    expect(router.redoLast()).toBe(false)
  })

  it('a grouped bulk timeline operation is one undo step in the routed order', () => {
    editFlame(1)
    timeline.runWithSingleUndo(() => {
      for (let i = 0; i < 30; i++) addKeyframe(i, i)
    })
    expect(keyframeCount()).toBe(30)

    router.undoLast() // the whole bulk op
    expect(keyframeCount()).toBe(0)
    router.undoLast() // then the flame edit
    expect(flame.exposure).toBe(0)
  })

  it('canUndo/canRedo report the union of both systems', () => {
    expect(router.canUndo()).toBe(false)
    addKeyframe(1, 1)
    expect(router.canUndo()).toBe(true)
    expect(router.canRedo()).toBe(false)
    router.undoLast()
    expect(router.canUndo()).toBe(false)
    expect(router.canRedo()).toBe(true)
  })

  it('non-journaled histories stay isolated from the shared journal', () => {
    // Simulates the variation browser's throwaway preview history.
    const [, setPreview, previewHistory] = createStoreHistory(
      createStore({ value: 0 }),
    )
    addKeyframe(10, 0.5)
    router.undoLast()
    expect(timeline.hasTimelineRedo()).toBe(true)

    // An isolated edit must NOT clear the app's redo...
    setPreview((draft) => {
      draft.value = 1
    })
    expect(timeline.hasTimelineRedo()).toBe(true)
    // ...and carries no recency stamps.
    expect(previewHistory.peekUndoSeq()).toBe(null)
  })

  it('load boundary: tracks load clears timeline entries from the routed order', () => {
    editFlame(1)
    addKeyframe(10, 0.5)
    timeline.loadTracks([]) // e.g. New Flame / plain load
    // The only undoable action left is the flame edit.
    expect(router.undoLast()).toBe(true)
    expect(flame.exposure).toBe(0)
    expect(router.undoLast()).toBe(false)
  })

  // The session recorder decides whether an undo is replayable from these
  // peeks, so "what would undo do?" must never disagree with what it does.
  describe('peeking the next target', () => {
    it('reports the system each undo/redo will act on', () => {
      editFlame(1)
      addKeyframe(10, 0.5)
      editFlame(2)

      expect(router.peekUndoTarget()?.system).toBe('flame')
      router.undoLast()
      expect(router.peekUndoTarget()?.system).toBe('timeline')
      expect(router.peekRedoTarget()?.system).toBe('flame')
      router.undoLast()
      expect(router.peekUndoTarget()?.system).toBe('flame')
      // Redo replays forward in original order: the timeline edit is next.
      expect(router.peekRedoTarget()?.system).toBe('timeline')
    })

    it('reports undefined exactly when there is nothing left to do', () => {
      expect(router.peekUndoTarget()).toBeUndefined()
      expect(router.peekRedoTarget()).toBeUndefined()
      expect(router.undoLast()).toBe(false)

      editFlame(1)
      expect(router.peekUndoTarget()).toBeDefined()
      expect(router.peekRedoTarget()).toBeUndefined()
      router.undoLast()
      expect(router.peekUndoTarget()).toBeUndefined()
      expect(router.peekRedoTarget()).toBeDefined()
    })

    it('carries the journal stamp of the entry it would apply', () => {
      editFlame(1)
      const first = router.peekUndoTarget()?.seq
      editFlame(2)
      const second = router.peekUndoTarget()?.seq
      expect(first).toEqual(expect.any(Number))
      // Monotonic: a later edit stamps higher, which is what lets the
      // recorder tell in-session edits from ones predating the recording.
      expect(second as number).toBeGreaterThan(first as number)
    })
  })
})
