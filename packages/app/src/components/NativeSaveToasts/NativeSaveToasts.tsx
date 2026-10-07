import { onCleanup } from 'solid-js'
import { useToast } from '@/contexts/ToastContext'
import { setSaveNotifier } from '@/lib/nativeSave'
import { IS_NATIVE } from '@/lib/platform'

/**
 * lib/nativeSave runs outside any component, so it cannot reach the toast
 * column on its own. This lends it one, so a native save can say where the
 * file went and offer to share it. Renders nothing; mount it once inside each
 * ToastProvider. On the web it does nothing: the browser shows its own
 * download UI.
 */
export function NativeSaveToasts() {
  const { showToast } = useToast()
  if (IS_NATIVE) {
    setSaveNotifier((message, actions) => {
      showToast(message, undefined, actions)
    })
    onCleanup(() => {
      setSaveNotifier(null)
    })
  }
  return null
}
