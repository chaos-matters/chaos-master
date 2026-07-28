import { createContext, createSignal, onCleanup, untrack } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'
import type { JSX } from 'solid-js'

/** Optional button on a toast; clicking runs the handler and dismisses. */
export type ToastAction = { label: string; onClick: () => void }

/**
 * 'sticky' = never auto-hide. For questions (e.g. the autosave consent
 * prompt): the toast stays up until the user clicks one of its actions.
 */
export type ToastDuration = number | 'sticky'

export type ToastItem = {
  id: number
  message: string
  actions: ToastAction[] | null
  sticky: boolean
}

interface ToastContextValue {
  toasts: () => ToastItem[]
  showToast: (
    msg: string,
    durationMs?: ToastDuration,
    actions?: ToastAction[],
  ) => number
  dismissToast: (id?: number) => void
}

// Keep the top-right column short so it never walls off that corner; sticky
// question toasts are never evicted, they wait for an answer.
const MAX_TOASTS = 4
const DEFAULT_INFO_MS = 4000
// Action toasts linger longer by default so the user can react.
const DEFAULT_ACTION_MS = 12000

/**
 * Toast state as a plain store so the timer/eviction/dedupe rules are unit
 * testable without mounting the provider.
 */
export function createToastStore() {
  const [toasts, setToasts] = createSignal<ToastItem[]>([])
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  let nextId = 1

  function dismissToast(id?: number) {
    if (id === undefined) {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
      setToasts([])
      return
    }
    const timer = timers.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(id)
    }
    setToasts((list) => list.filter((t) => t.id !== id))
  }

  function armTimer(id: number, ms: number) {
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id)
        dismissToast(id)
      }, ms),
    )
  }

  // untrack: this is an imperative API that reads the toast list (dedupe,
  // eviction). Called from inside a caller's createEffect, a tracked read
  // would subscribe that effect to the list — then every timer-driven
  // removal re-runs the effect, which re-shows the toast, and it never dies.
  function showToast(
    message: string,
    durationMs?: ToastDuration,
    actions?: ToastAction[],
  ): number {
    return untrack(() => showToastImpl(message, durationMs, actions))
  }

  function showToastImpl(
    message: string,
    durationMs?: ToastDuration,
    actions?: ToastAction[],
  ): number {
    const sticky = durationMs === 'sticky'
    const ms =
      typeof durationMs === 'number'
        ? durationMs
        : actions
          ? DEFAULT_ACTION_MS
          : DEFAULT_INFO_MS

    // Re-showing the same plain message (e.g. mashing a copy button) restarts
    // its timer instead of stacking duplicates.
    if (!sticky && !actions) {
      const dup = toasts().find(
        (t) => !t.sticky && t.actions === null && t.message === message,
      )
      if (dup) {
        clearTimeout(timers.get(dup.id))
        armTimer(dup.id, ms)
        return dup.id
      }
    }

    // Evict at the cap, cheapest toast first. A plain status line is
    // reproducible; a toast carrying actions may be the only route to an
    // operation (the custom-variation delete offers Undo as its sole recovery
    // path), and a sticky one is an unanswered question. Falling through to
    // the oldest of any kind keeps the column bounded even if every slot is
    // sticky — otherwise MAX_TOASTS silently stops applying.
    if (toasts().length >= MAX_TOASTS) {
      const list = toasts()
      const evict =
        list.find((t) => !t.sticky && t.actions === null) ??
        list.find((t) => !t.sticky) ??
        list[0]
      if (evict) {
        dismissToast(evict.id)
      }
    }

    // A sticky toast is dismissed by answering it, so it must have something
    // to answer with. Without actions there is no timer AND no control (plain
    // toasts are pointer-events: none), which would pin it on screen for the
    // session — fall back to a timed toast rather than stranding it.
    const dismissible = sticky && (actions?.length ?? 0) > 0

    const id = nextId++
    setToasts((list) => [
      ...list,
      { id, message, actions: actions ?? null, sticky: dismissible },
    ])
    if (!dismissible) {
      armTimer(id, ms)
    }
    return id
  }

  return { toasts, showToast, dismissToast }
}

const ToastContext = createContext<ToastContextValue>()

export function ToastProvider(props: { children: JSX.Element }) {
  const store = createToastStore()

  onCleanup(() => {
    store.dismissToast()
  })

  return (
    <ToastContext.Provider value={store}>
      {props.children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContextSafe(ToastContext, 'useToast', 'ToastProvider')
}
