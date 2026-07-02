import { createContext, createSignal, onCleanup } from 'solid-js'
import { useContextSafe } from '@/utils/useContextSafe'
import type { JSX } from 'solid-js'

/** Optional button on a toast; clicking runs the handler and dismisses. */
export type ToastAction = { label: string; onClick: () => void }

interface ToastContextValue {
  toastMessage: () => string | null
  toastActions: () => ToastAction[] | null
  showToast: (msg: string, durationMs?: number, actions?: ToastAction[]) => void
  dismissToast: () => void
}

const ToastContext = createContext<ToastContextValue>()

export function ToastProvider(props: { children: JSX.Element }) {
  const [toastMessage, setToastMessage] = createSignal<string | null>(null)
  const [toastActions, setToastActions] = createSignal<ToastAction[] | null>(
    null,
  )
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  function dismissToast() {
    clearTimeout(toastTimer)
    setToastMessage(null)
    setToastActions(null)
  }

  function showToast(
    msg: string,
    durationMs?: number,
    actions?: ToastAction[],
  ) {
    setToastMessage(msg)
    setToastActions(actions ?? null)
    clearTimeout(toastTimer)
    // Action toasts linger longer by default so the user can react.
    toastTimer = setTimeout(
      dismissToast,
      durationMs ?? (actions ? 12000 : 2500),
    )
  }

  onCleanup(() => {
    clearTimeout(toastTimer)
  })

  return (
    <ToastContext.Provider
      value={{ toastMessage, toastActions, showToast, dismissToast }}
    >
      {props.children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContextSafe(ToastContext, 'useToast', 'ToastProvider')
}
