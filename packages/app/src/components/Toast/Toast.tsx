import { For, Show } from 'solid-js'
import ui from '@/App.module.css'
import { useToast } from '@/contexts/ToastContext'

/**
 * Global toast column: fixed top-right, stacked, and above every modal and
 * overlay so feedback fired from inside a dialog is still visible. Rendered
 * once at the App level; everything else talks to it through useToast().
 */
export function ToastHost() {
  const { toasts, dismissToast } = useToast()

  return (
    // One live region on the container only. Putting role="status"/"alert" on
    // each item as well nests live regions, which makes politeness resolve off
    // the inner node and causes some screen readers to announce a newly
    // inserted toast twice.
    <div class={ui.toastRegion} aria-live="polite" aria-atomic="false">
      <For each={toasts()}>
        {(toast) => (
          <div
            class={ui.toast}
            classList={{ [ui.toastActionable as string]: !!toast.actions }}
          >
            <span>{toast.message}</span>
            <Show when={toast.actions}>
              {(actions) => (
                <span class={ui.toastActions}>
                  <For each={actions()}>
                    {(action) => (
                      <button
                        type="button"
                        class={ui.toastBtn}
                        onClick={() => {
                          // Dismiss first so an action that shows its own
                          // toast isn't immediately clobbered by this one
                          // being removed.
                          dismissToast(toast.id)
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
      </For>
    </div>
  )
}
