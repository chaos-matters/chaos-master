import { Show } from 'solid-js'
import { useToast } from '@/contexts/ToastContext'
import ui from '@/App.module.css'

export function Toast() {
  const { toastMessage } = useToast()

  return (
    <Show when={toastMessage()}>
      {(msg) => <div class={ui.toast}>{msg()}</div>}
    </Show>
  )
}
