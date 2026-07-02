import { For, Show } from 'solid-js'
import ui from '@/App.module.css'
import { useToast } from '@/contexts/ToastContext'

export function Toast() {
  const { toastMessage, toastActions, dismissToast } = useToast()

  return (
    <Show when={toastMessage()}>
      {(msg) => (
        <div
          class={ui.toast}
          classList={{ [ui.toastActionable as string]: !!toastActions() }}
        >
          <span>{msg()}</span>
          <Show when={toastActions()}>
            {(actions) => (
              <span class={ui.toastActions}>
                <For each={actions()}>
                  {(action) => (
                    <button
                      type="button"
                      class={ui.toastBtn}
                      onClick={() => {
                        // Dismiss first so an action that shows its own toast
                        // isn't immediately clobbered by this dismissal.
                        dismissToast()
                        action.onClick()
                      }}
                    >
                      {action.label}
                    </button>
                  )}
                </For>
              </span>
            )}
          </Show>
        </div>
      )}
    </Show>
  )
}
