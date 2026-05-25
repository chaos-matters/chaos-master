import { createContext, useContext, createSignal, JSX } from 'solid-js'

interface ToastContextValue {
  toastMessage: () => string | null
  showToast: (msg: string, durationMs?: number) => void
}

const ToastContext = createContext<ToastContextValue>()

export function ToastProvider(props: { children: JSX.Element }) {
  const [toastMessage, setToastMessage] = createSignal<string | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  function showToast(msg: string, durationMs = 2500) {
    setToastMessage(msg)
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => setToastMessage(null), durationMs)
  }

  return (
    <ToastContext.Provider value={{ toastMessage, showToast }}>
      {props.children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
