/**
 * Whether this layout offers the guided tours at all.
 *
 * Every tour step points at a `data-tour-target` in the desktop workspace:
 * the sidebar, the timeline, the toolbar. The touch layouts have none of
 * them, so on a phone 13 of the App Tour's 15 steps highlighted nothing and
 * talked about a sidebar the screen does not show. Until the touch surfaces
 * carry tour targets of their own, a touch layout does not offer a tour: the
 * welcome screen's Guided Tours, the Settings list and `#tour=` links all ask
 * here first.
 */
import { isTouchLayout } from '@/stores/workspaceLayoutStore'

export function toursOffered(): boolean {
  return !isTouchLayout()
}
