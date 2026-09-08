import { For, Show } from 'solid-js'
import ui from '@/App.module.css'
import { useToast } from '@/contexts/ToastContext'
import { isTouchLayout } from '@/stores/workspaceLayoutStore'

/**
 * Global toast column: fixed top-right on desktop, and top-left on touch/tablet
 * layouts so it never covers the inspector deck on the right.
 */
export function ToastHost() {
  const { toasts, dismissToast } = useToast()

  return (
    // One live region on the container only. Putting role="status"/"alert" on
    // each item as well nests live regions, which makes politeness resolve off
    // the inner node and causes some screen readers to announce a newly
    // inserted toast twice.
    <div
      class={ui.toastRegion}
      classList={{ [ui.toastRegionTouch as string]: isTouchLayout() }}
      aria-live="polite"
      aria-atomic="false"
    >
      <For each={toasts()}>
        {(toast) => (
          <div
            class={ui.toast}
            classList={{
              [ui.toastActionable as string]: !!toast.actions,
              [ui.toastTouch as string]: isTouchLayout(),
            }}
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
