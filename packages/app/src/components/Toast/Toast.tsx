import { Show } from 'solid-js'
import ui from '@/App.module.css'
import { useToast } from '@/contexts/ToastContext'

export function Toast() {
  const { toastMessage } = useToast()

  return (
    <Show when={toastMessage()}>
      {(msg) => <div class={ui.toast}>{msg()}</div>}
    </Show>
  )
}
