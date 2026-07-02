import { batch, createSignal } from 'solid-js'
import { reconcile, unwrap } from 'solid-js/store'
import { applyPatchesMutatively, enableStandardPatches, produceWithPatches, } from 'structurajs'
import { deepClone } from './clone'
import { compressPatches, forwardBackwardPatchPairDoesNothing, } from './compressPatches'
import type { SetStoreFunction, Store } from 'solid-js/store'
import type { Patch } from 'structurajs'

// Three "immer"-like libraries were considered
// immer - freezes objects it touches, doesn't support reference cycles
// mutative - doesn't support mutable applyPatches at all
// structurajs - works, but requires enableStandardPatches,
//               because their default patches replace objects along the whole path
//               instead of doing a pin-point update.
enableStandardPatches(true)

type HistoryItem = {
  description?: string
  forwardPatches: Patch[]
  backwardPatches: Patch[]
}

export type HistorySetter<T extends object> = (
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  setFn: (draft: T) => T | void,
  description?: string,
) => void

export type ChangeHistory<T> = {
  readonly replace: (value: T, description?: string) => void
  readonly undo: () => void
  readonly redo: () => void
  readonly hasUndo: () => boolean
  readonly hasRedo: () => boolean
  readonly startPreview: (description?: string) => void
  readonly isPreviewing: () => boolean
  readonly isUndoingOrRedoing: () => boolean
  readonly commit: () => void
}

export function createStoreHistory<T extends object>([store, setStore]: [
  Store<T>,
  SetStoreFunction<T>,
]) {
  const [stackIndex, setStackIndex] = createSignal(-1)
  const [isUndoingOrRedoing, setIsUndoingOrRedoing] =
    createSignal<boolean>(false)
  const [stack, setStack] = createSignal<HistoryItem[]>([], { equals: false })
  const [preview, setPreview] = createSignal<HistoryItem | undefined>(
    undefined,
    {
      equals: false,
    },
  )

  const hasUndo = () => stackIndex() >= 0
  const hasRedo = () => stackIndex() < stack().length - 1
  const isPreviewing = () => Boolean(preview())

  function addToStack(item: HistoryItem) {
    const forwardPatches = compressPatches(item.forwardPatches)
    const backwardPatches = compressPatches(item.backwardPatches)
    if (forwardPatches.length === 0 && backwardPatches.length === 0) {
      return
    }
    if (forwardBackwardPatchPairDoesNothing(forwardPatches, backwardPatches)) {
      return
    }
    // Deep-clone the payloads going into the stack: patch values otherwise
    // share object identity with nodes adopted into the live store (by
    // reconcile in set/replace/undo/redo), and later in-place store edits
    // would silently rewrite history entries — corrupting redo.
    const compressedItem: HistoryItem = {
      forwardPatches: deepClone(forwardPatches),
      backwardPatches: deepClone(backwardPatches),
      description: item.description,
    }
    setStack((p) => {
      p.splice(stackIndex() + 1, Infinity, compressedItem)
      setStackIndex(p.length - 1)
      return p
    })
  }

  function undo() {
    if (preview()) {
      console.warn("Can't undo while previewing changes.")
      return
    }
    const i = stackIndex()
    const item = stack()[i]
    if (!item) {
      console.warn('Nothing to undo')
      return
    }
    const { backwardPatches } = item
    // Apply patches to a plain object copy, then reconcile into the store.
    // Using produce + applyPatchesMutatively doesn't truly remove deleted keys
    // from SolidJS stores (produce's proxy converts `delete` to setting
    // undefined), which leaves zombie entries in transform records.
    // The extra deepClone before reconcile keeps stack payloads isolated:
    // applyPatchesMutatively splices patch VALUE objects into the result, and
    // reconcile would adopt them into the live store by reference.
    const plain = deepClone(store)
    const result = applyPatchesMutatively(plain, backwardPatches)
    setStore(reconcile(deepClone(result ?? plain) as T))
    setStackIndex(i - 1)
  }

  function redo() {
    if (preview()) {
      console.warn("Can't redo while previewing changes.")
      return
    }
    const i = stackIndex() + 1
    const item = stack()[i]
    if (!item) {
      console.warn('Nothing to redo')
      return
    }
    const { forwardPatches } = item
    const plain = deepClone(store)
    const result = applyPatchesMutatively(plain, forwardPatches)
    setStore(reconcile(deepClone(result ?? plain) as T))
    setStackIndex(i)
  }

  const set: HistorySetter<T> = (setFn, description) => {
    // Run the mutation callback exactly ONCE. produceWithPatches yields both
    // the resulting state and the patches; the store is then updated by
    // reconciling that result. Re-running setFn against the store (the old
    // `setStore(produce(setFn))`) desynced store from history whenever the
    // callback wasn't deterministic — e.g. `generateTransformId()` inside a
    // setter recorded one UUID in the patches while the store received
    // another, so undo of "New transform" silently did nothing and redo
    // duplicated it. Unchanged subtrees keep their identity through
    // produceWithPatches, so reconcile still yields fine-grained updates.
    const [result, forwardPatches, backwardPatches] = produceWithPatches(
      unwrap(store),
      (draft) => {
        setFn(draft as T)
      },
    )
    batch(() => {
      setStore(reconcile((result ?? unwrap(store)) as T))
      const preview_ = preview()
      if (preview_) {
        preview_.forwardPatches.push(...forwardPatches)
        preview_.backwardPatches.unshift(...backwardPatches)
        setPreview(preview_)
      } else {
        addToStack({ forwardPatches, backwardPatches, description })
      }
    })
  }

  function startPreview(description?: string) {
    const preview_ = preview()
    if (preview_) {
      // Auto-commit the stale preview (e.g. orphaned by wheel debounce or
      // component unmount) instead of crashing.
      console.warn(
        `Auto-committing stale preview "${preview_.description}" before starting "${description}"`,
      )
      commit()
    }
    setPreview({ forwardPatches: [], backwardPatches: [], description })
  }

  function commit() {
    const item = preview()
    if (!item) {
      // No preview active -- this is expected when pointerUp/pointerCancel
      // fires without a matching startPreview (e.g., click-without-drag,
      // browser-initiated cancel, or component unmount). Safe to ignore.
      return
    }
    batch(() => {
      addToStack(item)
      setPreview(undefined)
    })
  }

  function replace(value: T, description?: string) {
    batch(() => {
      const [_, forwardPatches, backwardPatches] = produceWithPatches(
        deepClone(store),
        () => value,
      )
      setStore(reconcile(value))
      addToStack({ forwardPatches, backwardPatches, description })
    })
  }

  function wrapIntoUndoing(fn: () => void) {
    return () => {
      try {
        setIsUndoingOrRedoing(true)
        fn()
      } finally {
        setIsUndoingOrRedoing(false)
      }
    }
  }

  return [
    store,
    set,
    {
      undo: wrapIntoUndoing(undo),
      redo: wrapIntoUndoing(redo),
      hasUndo,
      hasRedo,
      isUndoingOrRedoing,
      startPreview,
      isPreviewing,
      commit,
      replace,
    } satisfies ChangeHistory<T>,
  ] as const
}
