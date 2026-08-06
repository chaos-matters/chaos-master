import { batch, createSignal } from 'solid-js'
import { reconcile, unwrap } from 'solid-js/store'
import { applyPatchesMutatively, enableStandardPatches, produceWithPatches, } from 'structurajs'
import { deepClone } from './clone'
import { compressPatches, forwardBackwardPatchPairDoesNothing, } from './compressPatches'
import { clearAllRedos, nextUndoSeq, registerRedoClearer } from './undoJournal'
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
  /** Journal stamp for cross-system chronological undo (journaled mode). */
  seq?: number
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
  /** Journal stamp of the entry the next undo/redo would apply (null: none).
   *  Used by the cross-system undo router; always null when not journaled. */
  readonly peekUndoSeq: () => number | null
  readonly peekRedoSeq: () => number | null
  /** Mutate the store WITHOUT recording history. For automated writers that
   *  must never pollute undo: the animation export applying per-frame state
   *  (one entry per exported frame otherwise) and derived follower effects
   *  like 3D auto-exposure (whose reactive write after an undo would inject
   *  a fresh entry and destroy redo). */
  readonly setSilently: (setFn: (draft: T) => void) => void
}

type CreateStoreHistoryOptions = {
  /** Join the app-wide undo journal: entries get recency stamps for the
   *  cross-system undo router, and any journaled push (here or in the
   *  timeline) invalidates redo everywhere. Leave OFF for throwaway preview
   *  histories (e.g. the variation browser) so they stay isolated. */
  journal?: boolean
  /** Called whenever a NEW entry lands on the stack (set, commit, replace) —
   *  exactly once per undoable edit, after no-op elision, and never for
   *  undo/redo/setSilently. The session recorder hooks the main flame
   *  history here to detect writes that did not arrive through a registered
   *  command (see recorder/recorder.ts). */
  onEntryPushed?: (description?: string) => void
}

export function createStoreHistory<T extends object>(
  [store, setStore]: [Store<T>, SetStoreFunction<T>],
  { journal = false, onEntryPushed }: CreateStoreHistoryOptions = {},
) {
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
  const peekUndoSeq = () => stack()[stackIndex()]?.seq ?? null
  const peekRedoSeq = () => stack()[stackIndex() + 1]?.seq ?? null

  if (journal) {
    // Truncating the forward branch IS this history's redo-clear.
    registerRedoClearer(() => {
      setStack((p) => {
        p.splice(stackIndex() + 1, Infinity)
        return p
      })
    })
  }

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
      seq: journal ? nextUndoSeq() : undefined,
    }
    // A journaled edit invalidates redo EVERYWHERE (timeline included) — the
    // local splice below only truncates this history's own forward branch.
    if (journal) clearAllRedos()
    setStack((p) => {
      p.splice(stackIndex() + 1, Infinity, compressedItem)
      setStackIndex(p.length - 1)
      return p
    })
    onEntryPushed?.(compressedItem.description)
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

  const setSilently = (setFn: (draft: T) => void) => {
    const [result] = produceWithPatches(unwrap(store), (draft) => {
      setFn(draft as T)
    })
    setStore(reconcile((result ?? unwrap(store)) as T))
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
    // The recipe passes setFn's return through: a replacement-style setter
    // (`() => newFlame` — flame.reset, flame.loadPreset, seeded generate)
    // replaces the document wholesale, exactly like replace() below, whose
    // `() => value` recipe is what proves structurajs supports recipe
    // returns. A mutation-style setter returns undefined and behaves as
    // before. (Previously the braces swallowed the return, silently turning
    // every replacement-style command into a no-op.)
    const [result, forwardPatchesRaw, backwardPatchesRaw] = produceWithPatches(
      unwrap(store),
      (draft) => setFn(draft as T),
    )
    // Isolate patch payloads BEFORE reconcile touches the store: object-valued
    // patches reference the store's existing raw nodes, and reconcile mutates
    // those nodes IN PLACE (that is its point) — without cloning first, a
    // backward patch's "old value" silently becomes the new one and undo
    // applies a no-op. (Leaf/primitive patches were immune, which is why this
    // only bit object-replacing edits like affine drags.)
    const forwardPatches = deepClone(forwardPatchesRaw)
    const backwardPatches = deepClone(backwardPatchesRaw)
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
      peekUndoSeq,
      peekRedoSeq,
      setSilently,
    } satisfies ChangeHistory<T>,
  ] as const
}
