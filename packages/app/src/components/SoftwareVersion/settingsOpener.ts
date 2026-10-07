/**
 * Opens Settings and more from outside the editor.
 *
 * The dialog belongs to the editor: it is built from the editor's own
 * settings (the picker mode, the sidebar width, the theme), and the version
 * menu opens it through the `showHelp` the editor hands it. The welcome
 * screen's version pill sits outside the editor and used to reach that menu
 * by clicking a DOM node by class name. 8bfe95cb turned the pill into a menu
 * and took the class away, so the welcome screen closed and nothing opened.
 *
 * So the version menu provides its opener here while it is mounted, and
 * `openSettings` runs it. A request made before the editor has mounted (the
 * workspace chunk still loading behind the welcome screen) waits for it.
 */

let opener: (() => void) | undefined
let pending = false

/** Called by the version menu with its own opener; returns the withdrawal. */
export function provideSettingsOpener(open: () => void): () => void {
  opener = open
  if (pending) {
    pending = false
    open()
  }
  return () => {
    if (opener === open) opener = undefined
  }
}

/** Opens Settings and more now, or as soon as the editor can. */
export function openSettings(): void {
  if (opener) {
    opener()
  } else {
    pending = true
  }
}
