import { createStore } from 'solid-js/store'
import { describe, expect, it } from 'vitest'
import { createStoreHistory } from './createStoreHistory'

type Item = { value: number; nested?: { deep: number } }
type TestState = {
  name: string
  items: Record<string, Item>
}

const initialState = (): TestState => ({
  name: 'base',
  items: { a: { value: 1, nested: { deep: 10 } } },
})

function makeHistory(initial: TestState = initialState()) {
  const [store, set, history] = createStoreHistory(
    createStore<TestState>(structuredClone(initial)),
  )
  return { store, set, history }
}

const snapshot = (store: TestState) => JSON.parse(JSON.stringify(store))

describe('createStoreHistory', () => {
  describe('basic undo/redo', () => {
    it('round-trips a value edit', () => {
      const { store, set, history } = makeHistory()
      set((draft) => {
        draft.items.a!.value = 2
      })
      expect(store.items.a!.value).toBe(2)
      history.undo()
      expect(store.items.a!.value).toBe(1)
      history.redo()
      expect(store.items.a!.value).toBe(2)
    })

    it('round-trips record key addition and deletion (no zombie keys)', () => {
      const { store, set, history } = makeHistory()
      set((draft) => {
        draft.items.b = { value: 5 }
      })
      expect(Object.keys(store.items)).toEqual(['a', 'b'])
      history.undo()
      expect(Object.keys(store.items)).toEqual(['a'])
      history.redo()
      expect(Object.keys(store.items)).toEqual(['a', 'b'])

      set((draft) => {
        delete draft.items.a
      })
      expect(Object.keys(store.items)).toEqual(['b'])
      history.undo()
      // Key order is not preserved across delete-undo (the key is re-added);
      // membership and content are what matter for these records.
      expect(Object.keys(store.items).sort()).toEqual(['a', 'b'])
      expect(store.items.a).toEqual({ value: 1, nested: { deep: 10 } })
    })

    it('does not record no-op sets', () => {
      const { set, history } = makeHistory()
      expect(history.hasUndo()).toBe(false)
      set((draft) => {
        draft.items.a!.value = 1 // unchanged
      })
      expect(history.hasUndo()).toBe(false)
    })

    it('undo/redo on empty stacks is a safe no-op', () => {
      const { store, history } = makeHistory()
      expect(() => {
        history.undo()
        history.redo()
      }).not.toThrow()
      expect(snapshot(store)).toEqual(initialState())
    })

    it('a new edit after undo truncates the redo branch', () => {
      const { set, history } = makeHistory()
      set((draft) => {
        draft.name = 'one'
      })
      set((draft) => {
        draft.name = 'two'
      })
      history.undo()
      expect(history.hasRedo()).toBe(true)
      set((draft) => {
        draft.name = 'three'
      })
      expect(history.hasRedo()).toBe(false)
    })
  })

  describe('non-deterministic mutation callbacks (single-execution contract)', () => {
    it('records exactly what the store received when the callback generates ids', () => {
      const { store, set, history } = makeHistory()
      // Simulates "New transform": a fresh random id is minted INSIDE the
      // setter. With the old double-execution set(), the patches recorded a
      // different id than the store received, so undo silently failed and
      // redo duplicated the entry.
      set((draft) => {
        draft.items[globalThis.crypto.randomUUID()] = { value: 42 }
      })
      const afterAdd = snapshot(store)
      expect(Object.keys(afterAdd.items)).toHaveLength(2)

      history.undo()
      expect(Object.keys(store.items)).toEqual(['a'])

      history.redo()
      // Redo must reproduce the exact state the user saw — same id, not a
      // re-rolled one, and exactly one copy.
      expect(snapshot(store)).toEqual(afterAdd)
    })

    it('side-effecting callbacks run exactly once per set()', () => {
      const { set } = makeHistory()
      let runs = 0
      set((draft) => {
        runs++
        draft.items.a!.value = 7
      })
      expect(runs).toBe(1)
    })

    it('random values land identically in store and history', () => {
      const { store, set, history } = makeHistory()
      set((draft) => {
        draft.items.a!.value = Math.random()
      })
      const rolled = store.items.a!.value
      history.undo()
      expect(store.items.a!.value).toBe(1)
      history.redo()
      expect(store.items.a!.value).toBe(rolled)
    })
  })

  describe('history payload isolation (no aliasing with the live store)', () => {
    it('later edits do not corrupt a replace entry (redo restores pristine state)', () => {
      const { store, set, history } = makeHistory()
      const loaded: TestState = {
        name: 'loaded',
        items: { x: { value: 100, nested: { deep: 1 } } },
      }
      history.replace(structuredClone(loaded))
      // Edit the freshly adopted subtree in place.
      set((draft) => {
        draft.items.x!.value = 999
      })
      history.undo() // revert edit
      history.undo() // revert load
      expect(snapshot(store)).toEqual(initialState())
      history.redo() // replay load — must NOT contain the later edit
      expect(store.items.x!.value).toBe(100)
      history.redo() // replay edit
      expect(store.items.x!.value).toBe(999)
    })

    it('undo targets are not corrupted by edits made after the undo', () => {
      const { store, set, history } = makeHistory()
      set((draft) => {
        draft.items.b = { value: 5, nested: { deep: 50 } }
      })
      const afterB = snapshot(store)
      set((draft) => {
        draft.items.b!.nested!.deep = 51
      })
      history.undo()
      expect(snapshot(store)).toEqual(afterB)
      // Mutate the restored subtree again; then undo/redo across it.
      set((draft) => {
        draft.items.b!.nested!.deep = 77
      })
      history.undo()
      expect(snapshot(store)).toEqual(afterB)
      history.redo()
      expect(store.items.b!.nested!.deep).toBe(77)
    })
  })

  describe('preview batching (drag gestures)', () => {
    it('collapses startPreview → many sets → commit into one undo step', () => {
      const { store, set, history } = makeHistory()
      history.startPreview('drag')
      for (let i = 2; i <= 10; i++) {
        set((draft) => {
          draft.items.a!.value = i
        })
      }
      history.commit()
      expect(store.items.a!.value).toBe(10)
      history.undo()
      expect(store.items.a!.value).toBe(1)
      expect(history.hasUndo()).toBe(false)
      history.redo()
      expect(store.items.a!.value).toBe(10)
    })

    it('commit without an active preview is a no-op', () => {
      const { history } = makeHistory()
      expect(() => {
        history.commit()
      }).not.toThrow()
      expect(history.hasUndo()).toBe(false)
    })

    it('a stale preview is auto-committed when a new one starts', () => {
      const { store, set, history } = makeHistory()
      history.startPreview('first')
      set((draft) => {
        draft.items.a!.value = 2
      })
      // Second startPreview must not lose the first gesture's changes.
      history.startPreview('second')
      set((draft) => {
        draft.name = 'renamed'
      })
      history.commit()
      history.undo() // second gesture
      expect(store.name).toBe('base')
      expect(store.items.a!.value).toBe(2)
      history.undo() // auto-committed first gesture
      expect(store.items.a!.value).toBe(1)
    })

    it('blocks undo/redo while previewing', () => {
      const { store, set, history } = makeHistory()
      set((draft) => {
        draft.items.a!.value = 3
      })
      history.startPreview('drag')
      history.undo()
      expect(store.items.a!.value).toBe(3) // unchanged — undo refused
      history.commit()
    })
  })

  describe('object-replacing edits (affine drags swap whole objects)', () => {
    // Regression guard: backward-patch values reference the store's raw
    // nodes, and reconcile mutates those nodes IN PLACE — patches must be
    // isolated before reconcile runs or undo silently applies a no-op.
    // Leaf-value edits never trip this (primitives are captured by value).
    it('undoes a single whole-object replacement', () => {
      const { store, set, history } = makeHistory()
      set((draft) => {
        draft.items.a = { value: 9, nested: { deep: 90 } }
      })
      expect(store.items.a!.value).toBe(9)
      history.undo()
      expect(store.items.a).toEqual({ value: 1, nested: { deep: 10 } })
      history.redo()
      expect(store.items.a).toEqual({ value: 9, nested: { deep: 90 } })
    })

    it('undoes sequential whole-object replacements step by step', () => {
      const { store, set, history } = makeHistory()
      set((draft) => {
        draft.items.a = { value: 2 }
      })
      set((draft) => {
        draft.items.a = { value: 3 }
      })
      history.undo()
      expect(store.items.a!.value).toBe(2)
      history.undo()
      expect(store.items.a!.value).toBe(1)
    })

    it('undoes a previewed drag that replaces an object per move', () => {
      const { store, set, history } = makeHistory()
      history.startPreview('Affine Translation')
      for (let i = 1; i <= 5; i++) {
        set((draft) => {
          draft.items.a = { value: i }
        })
      }
      history.commit()
      expect(store.items.a!.value).toBe(5)
      history.undo()
      expect(store.items.a).toEqual({ value: 1, nested: { deep: 10 } })
      history.redo()
      expect(store.items.a!.value).toBe(5)
    })
  })

  describe('setSilently (automated writers)', () => {
    it('mutates the store without recording history', () => {
      const { store, history } = makeHistory()
      history.setSilently((draft) => {
        draft.items.a!.value = 42
      })
      expect(store.items.a!.value).toBe(42)
      expect(history.hasUndo()).toBe(false)
    })

    it('does not disturb existing undo/redo state', () => {
      const { store, set, history } = makeHistory()
      set((draft) => {
        draft.name = 'edited'
      })
      history.undo()
      expect(history.hasRedo()).toBe(true)
      // A silent follower write (e.g. auto-exposure after the undo) must not
      // truncate redo or add entries.
      history.setSilently((draft) => {
        draft.items.a!.value = 9
      })
      expect(history.hasRedo()).toBe(true)
      expect(history.hasUndo()).toBe(false)
      history.redo()
      expect(store.name).toBe('edited')
    })
  })

  describe('replace', () => {
    it('is undoable back to the previous state', () => {
      const { store, history } = makeHistory()
      history.replace({ name: 'swapped', items: {} })
      expect(store.name).toBe('swapped')
      history.undo()
      expect(snapshot(store)).toEqual(initialState())
      history.redo()
      expect(store.name).toBe('swapped')
      expect(Object.keys(store.items)).toEqual([])
    })
  })
})
