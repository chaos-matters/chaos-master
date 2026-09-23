/**
 * Install Home's Escape boundary.
 *
 * Home overlays a still-mounted workspace, so the key is claimed in capture
 * phase: leaving Home must not also trigger a hidden editor shortcut. Native
 * dialogs remain the nearer layer and therefore keep first refusal. Under the
 * Arcade's screen lock, Escape is the pilot's Esc-twice, which Home leaves be.
 */
import { pilotOwnsKeyboard } from '@/arcade/pilot'

export function installHomeEscapeBoundary(
  onExit: () => void,
  eventRoot: Document = document,
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (pilotOwnsKeyboard()) return
    if (event.key !== 'Escape' || event.defaultPrevented) {
      return
    }

    if (eventRoot.querySelector('dialog[open]') !== null) {
      // Keep the still-mounted editor from seeing the key, but deliberately do
      // not preventDefault: the browser must remain free to fire the native
      // dialog `cancel` event and close/resolve the nearer layer.
      event.stopImmediatePropagation()
      return
    }

    event.preventDefault()
    event.stopImmediatePropagation()
    onExit()
  }

  eventRoot.addEventListener('keydown', onKeyDown, true)
  return () => {
    eventRoot.removeEventListener('keydown', onKeyDown, true)
  }
}
