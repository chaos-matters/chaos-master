/**
 * Undo and redo for a Solid store, kept as patches rather than snapshots.
 *
 * Every write to the document passes through here: ordinary edits, gestures
 * held open as a preview and committed as one entry, replay's owned previews,
 * and the silent writes that deliberately record nothing. It also tells a host
 * before the document changes under it, which is how anything presenting the
 * store as something else gets to land first.
 *
 * The types — an entry, the preview lease, the surface consumers hold and the
 * hooks a host passes in — are in `changeHistoryTypes.ts` and re-exported here.
 */
import { batch, createSignal } from 'solid-js'
import { reconcile, unwrap } from 'solid-js/store'
import { applyPatchesMutatively, enableStandardPatches, produceWithPatches, } from 'structurajs'
import { deepClone } from './clone'
import { compressPatches, forwardBackwardPatchPairDoesNothing, } from './compressPatches'
import { clearAllRedos, nextUndoSeq, registerRedoClearer } from './undoJournal'
import type { SetStoreFunction, Store } from 'solid-js/store'
import type { ChangeHistory, CreateStoreHistoryOptions, HistoryCommitOptions, HistoryItem, HistoryPreviewOwner, HistorySetter, PreviewHistoryItem, } from './changeHistoryTypes'

export type {
  ChangeHistory,
  HistoryCommitOptions,
  HistoryPreviewOwner,
  HistorySetter,
} from './changeHistoryTypes'

// Three "immer"-like libraries were considered
// immer - freezes objects it touches, doesn't support reference cycles
// mutative - doesn't support mutable applyPatches at all
// structurajs - works, but requires enableStandardPatches,
//               because their default patches replace objects along the whole path
//               instead of doing a pin-point update.
enableStandardPatches(true)

export function createStoreHistory<T extends object>(
  [store, setStore]: [Store<T>, SetStoreFunction<T>],
  {
    journal = false,
    onEntryPushed,
    onPreviewStarted,
    onBeforeDocumentWrite,
    onBeforeTimeTravel,
  }: CreateStoreHistoryOptions = {},
) {
  const [stackIndex, setStackIndex] = createSignal(-1)
  const [isUndoingOrRedoing, setIsUndoingOrRedoing] =
    createSignal<boolean>(false)
  const [stack, setStack] = createSignal<HistoryItem[]>([], { equals: false })
  const [preview, setPreview] = createSignal<PreviewHistoryItem | undefined>(
    undefined,
    {
      equals: false,
    },
  )
  let activePreviewOwner: HistoryPreviewOwner | undefined
  let takeoverInProgress: HistoryPreviewOwner | undefined

  const hasUndo = () => stackIndex() >= 0
  const hasRedo = () => stackIndex() < stack().length - 1
  // Ordinary gesture code commonly does
  // `if (!history.isPreviewing()) history.startPreview(...)`. An exclusive
  // replay preview belongs to a different producer, so it must look closed to
  // that caller; starting the gesture then takes replay over atomically.
  const isPreviewing = () => {
    const item = preview()
    return Boolean(
      item && (item.owner === undefined || item.owner === activePreviewOwner),
    )
  }
  const hasOpenPreview = () => preview() !== undefined
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

  function addToStack(item: HistoryItem, fromPreview = false) {
    const forwardPatches = compressPatches(item.forwardPatches)
    const backwardPatches = compressPatches(item.backwardPatches)
    const hasEffect =
      item.force === true ||
      item.undoEffect !== undefined ||
      item.redoEffect !== undefined
    if (
      !hasEffect &&
      forwardPatches.length === 0 &&
      backwardPatches.length === 0
    ) {
      return
    }
    if (
      !hasEffect &&
      forwardBackwardPatchPairDoesNothing(forwardPatches, backwardPatches)
    ) {
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
      undoEffect: item.undoEffect,
      redoEffect: item.redoEffect,
      force: item.force,
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
    onEntryPushed?.(compressedItem.description, fromPreview)
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
    // Before the store is read, never after: the callback may write the very
    // state this patch is computed against.
    onBeforeTimeTravel?.()
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
    batch(() => {
      setStore(reconcile(deepClone(result ?? plain) as T))
      item.undoEffect?.()
      setStackIndex(i - 1)
    })
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
    onBeforeTimeTravel?.()
    const { forwardPatches } = item
    const plain = deepClone(store)
    const result = applyPatchesMutatively(plain, forwardPatches)
    batch(() => {
      setStore(reconcile(deepClone(result ?? plain) as T))
      item.redoEffect?.()
      setStackIndex(i)
    })
  }

  const setSilently = (setFn: (draft: T) => void) => {
    const [result] = produceWithPatches(unwrap(store), (draft) => {
      setFn(draft as T)
    })
    setStore(reconcile((result ?? unwrap(store)) as T))
  }

  const replaceSilently = (value: T) => {
    setStore(reconcile(deepClone(value)))
  }

  /**
   * Hand an owned preview back before an unrelated producer writes.
   *
   * `onTakeover` is deliberately synchronous: the timed player clears its
   * pending timer and closes the replay transaction before this user write is
   * evaluated, so there is never a mixed preview. The defensive fallback
   * keeps the store writable if a future owner forgets to close its lease.
   */
  function relinquishOwnedPreview(): boolean {
    const item = preview()
    if (
      item?.owner === undefined ||
      item.owner === activePreviewOwner ||
      item.owner === takeoverInProgress
    ) {
      return false
    }

    takeoverInProgress = item.owner
    try {
      item.onTakeover?.()
    } finally {
      takeoverInProgress = undefined
    }

    const stillOwned = preview()
    if (stillOwned?.owner === item.owner) {
      console.warn(
        `Preview owner did not close "${stillOwned.description}" during takeover; committing it defensively`,
      )
      commitOwnedPreview(item.owner)
    }
    return true
  }

  const set: HistorySetter<T> = (setFn, description) => {
    onBeforeDocumentWrite?.()
    relinquishOwnedPreview()
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

  function openPreview(
    description?: string,
    owner?: HistoryPreviewOwner,
    onTakeover?: () => void,
  ) {
    relinquishOwnedPreview()
    const preview_ = preview()
    if (preview_) {
      // Auto-commit the stale preview (e.g. orphaned by wheel debounce or
      // component unmount) instead of crashing.
      console.warn(
        `Auto-committing stale preview "${preview_.description}" before starting "${description}"`,
      )
      commit()
    }
    setPreview({
      forwardPatches: [],
      backwardPatches: [],
      description,
      owner,
      onTakeover,
    })
    onPreviewStarted?.()
  }

  function startPreview(description?: string) {
    openPreview(description)
  }

  function startOwnedPreview(
    description: string | undefined,
    onTakeover: () => void,
  ): HistoryPreviewOwner {
    const owner = Symbol(description ?? 'history-preview')
    openPreview(description, owner, onTakeover)
    return owner
  }

  function withPreviewOwner<R>(owner: HistoryPreviewOwner, fn: () => R): R {
    if (preview()?.owner !== owner) {
      throw new Error('History preview owner no longer owns the active preview')
    }
    const previousOwner = activePreviewOwner
    activePreviewOwner = owner
    try {
      return fn()
    } finally {
      activePreviewOwner = previousOwner
    }
  }

  function commitItem(item: PreviewHistoryItem, options: HistoryCommitOptions) {
    batch(() => {
      addToStack({ ...item, ...options }, true)
      setPreview(undefined)
    })
  }

  function commit(options: HistoryCommitOptions = {}) {
    const item = preview()
    if (!item) {
      // No preview active -- this is expected when pointerUp/pointerCancel
      // fires without a matching startPreview (e.g., click-without-drag,
      // browser-initiated cancel, or component unmount). Safe to ignore.
      return
    }
    if (item.owner !== undefined) {
      // A pointer-up from a gesture that never started must not accidentally
      // close a replay transaction that happens to be open at the time.
      console.warn("Can't commit a preview owned by another producer.")
      return
    }
    commitItem(item, options)
  }

  function commitOwnedPreview(
    owner: HistoryPreviewOwner,
    options: HistoryCommitOptions = {},
  ): boolean {
    const item = preview()
    if (item?.owner !== owner) return false
    commitItem(item, options)
    return true
  }

  function replace(value: T, description?: string) {
    onBeforeDocumentWrite?.()
    relinquishOwnedPreview()
    batch(() => {
      const [_, forwardPatches, backwardPatches] = produceWithPatches(
        deepClone(store),
        () => value,
      )
      setStore(reconcile(value))
      addToStack({ forwardPatches, backwardPatches, description })
    })
  }

  /**
   * Rewrite the newest entry so that it ends where the document actually is.
   *
   * For a change that was presented as a transition and cut short: the entry
   * says "before -> target" while the document stopped on an intermediate
   * frame. Left alone, undo is exact only by luck and redo puts the viewer on
   * the target — a flame they interrupted precisely because they did not want
   * it. Amended, both directions land on states that were really on screen.
   *
   * Nothing is pushed, so the recorder never sees a transition as an edit, and
   * the entry keeps its description, its effects and its journal stamp: it is
   * the same action, it just ended sooner than it meant to.
   *
   * `recordedEnd` is the state the entry was recorded as ending on. The stack
   * holds patches and never snapshots, so it is the only way back to the state
   * the entry started from — and going back through the entry's own backward
   * patches is exact, because the pair are inverses by construction.
   *
   * Refused unless the newest entry is still the one `mark` was taken from, no
   * gesture or replay transaction owns the document, and that entry really
   * does end where the caller says: a transition with no entry behind it must
   * not rewrite somebody else's.
   */
  function amendNewestEntry(mark: number | null, recordedEnd: T): boolean {
    if (mark === null || preview() !== undefined) return false
    const i = stackIndex()
    const item = stack()[i]
    if (!item || i !== stack().length - 1 || item.seq !== mark) return false

    const end = deepClone(recordedEnd)
    const before = (applyPatchesMutatively(end, item.backwardPatches) ??
      end) as T
    // Does this entry really end where the caller says? Taking it backwards
    // and forwards again must land back on `recordedEnd`. It is a consistency
    // check rather than a proof — an entry whose forward values happen to
    // agree passes it — but it does refuse the case that matters, a
    // transition with no entry of its own trying to rewrite somebody else's.
    // A false refusal only leaves the entry as it is, which is where it was.
    const roundTrip = applyPatchesMutatively(
      deepClone(before) as object,
      item.forwardPatches,
    )
    if (JSON.stringify(roundTrip) !== JSON.stringify(recordedEnd)) return false

    const [, forwardPatches, backwardPatches] = produceWithPatches(
      deepClone(before),
      () => deepClone(unwrap(store)),
    )
    const amended: HistoryItem = {
      ...item,
      forwardPatches: deepClone(compressPatches(forwardPatches)),
      backwardPatches: deepClone(compressPatches(backwardPatches)),
    }
    setStack((p) => {
      p.splice(i, 1, amended)
      return p
    })
    return true
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
      startOwnedPreview,
      withPreviewOwner,
      takeOverOwnedPreview: relinquishOwnedPreview,
      hasOpenPreview,
      isPreviewing,
      commit,
      commitOwnedPreview,
      replace,
      amendNewestEntry,
      peekUndoSeq,
      peekRedoSeq,
      setSilently,
      replaceSilently,
    } satisfies ChangeHistory<T>,
  ] as const
}
