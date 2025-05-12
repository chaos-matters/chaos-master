import { batch, createSignal } from 'solid-js'
import { produce, unwrap } from 'solid-js/store'
import {
  applyPatchesMutatively,
  enableStandardPatches,
  produceWithPatches,
} from 'structurajs'
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
  readonly commit: () => void
}

export function createStoreHistory<T extends object>([store, setStore]: [
  Store<T>,
  SetStoreFunction<T>,
]) {
  const [stackIndex, setStackIndex] = createSignal(-1)
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

  function add(item: HistoryItem) {
    if (item.forwardPatches.length === 0 && item.backwardPatches.length === 0) {
      return
    }
    setStack((p) => {
      p.splice(stackIndex() + 1, Infinity, item)
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
    let swapWhole = undefined as T | undefined
    setStore(
      produce((draft) => {
        const value = applyPatchesMutatively(draft, backwardPatches)
        if (value !== draft) {
          swapWhole = value as T
        }
      }),
    )
    if (swapWhole !== undefined) {
      setStore(swapWhole)
    }
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
    let swapWhole = undefined as T | undefined
    setStore(
      produce((draft) => {
        const value = applyPatchesMutatively(draft, forwardPatches)
        if (value !== draft) {
          swapWhole = value as T
        }
      }),
    )
    if (swapWhole !== undefined) {
      setStore(swapWhole)
    }
    setStackIndex(i)
  }

  const set: HistorySetter<T> = (setFn, description) => {
    batch(() => {
      const preview_ = preview()
      if (preview_) {
        const [_, forwardPatches, backwardPatches] = produceWithPatches(
          unwrap(store),
          (draft) => {
            setFn(draft as T)
          },
        )
        setStore(produce(setFn))
        preview_.forwardPatches.push(...forwardPatches)
        preview_.backwardPatches.unshift(...backwardPatches)
        setPreview(preview_)
        return
      }
      const [_, forwardPatches, backwardPatches] = produceWithPatches(
        unwrap(store),
        (draft) => {
          setFn(draft as T)
        },
      )
      setStore(produce(setFn))
      add({ forwardPatches, backwardPatches, description })
    })
  }

  function startPreview(description?: string) {
    const preview_ = preview()
    if (preview_) {
      throw new Error(
        `Can't start preview while existing preview in progress: ${preview_.description}`,
      )
    }
    setPreview({ forwardPatches: [], backwardPatches: [], description })
  }

  function commit() {
    const item = preview()
    if (!item) {
      console.warn('No preview to commit')
      return
    }
    batch(() => {
      add(item)
      setPreview(undefined)
    })
  }

  function replace(value: T, description?: string) {
    batch(() => {
      const [_, forwardPatches, backwardPatches] = produceWithPatches(
        structuredClone(unwrap(store)),
        () => value,
      )
      setStore(value)
      add({ forwardPatches, backwardPatches, description })
    })
  }

  return [
    store,
    set,
    {
      replace,
      undo,
      redo,
      hasUndo,
      hasRedo,
      startPreview,
      isPreviewing,
      commit,
    } satisfies ChangeHistory<T>,
  ] as const
}
